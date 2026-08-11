import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model } from 'mongoose'
import { Job, JobDocument, JobType } from './schemas/job.schema'

const DEDUPE_WINDOW_MS = 10 * 60 * 1000

@Injectable()
export class JobsService implements OnModuleInit {
  constructor(@InjectModel(Job.name) private readonly jobModel: Model<JobDocument>) {}

  // A fire-and-forget background task has no way to survive a pod restart -
  // this app redeploys frequently, so a job stuck mid-flight when the
  // process dies would otherwise sit as "running" forever with no way for
  // the frontend to know it's actually dead. Same "backfill on boot"
  // pattern as RecipesService.onModuleInit.
  async onModuleInit(): Promise<void> {
    await this.jobModel.updateMany(
      { status: { $in: ['queued', 'running'] } },
      { $set: { status: 'failed', finishedAt: new Date(), error: 'Interrupted by a server restart - please retry.' } },
    )
  }

  // dedupeKey lets a caller avoid starting a duplicate run of the same
  // submission (e.g. a user retrying an import that looked like it failed
  // client-side while it was actually still running server-side) - if the
  // same user already has an in-flight job, or one that finished within the
  // last 10 minutes, for the same dedupeKey, that job is returned instead of
  // starting a new one.
  async create(userId: string, type: JobType, label?: string, dedupeKey?: string): Promise<JobDocument> {
    if (dedupeKey) {
      const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS)
      const existing = await this.jobModel
        .findOne({
          userId,
          dedupeKey,
          $or: [
            { status: { $in: ['queued', 'running'] } },
            { status: { $in: ['done', 'failed'] }, finishedAt: { $gte: cutoff } },
          ],
        })
        .sort({ createdAt: -1 })
        .exec()
      if (existing) return existing
    }
    return this.jobModel.create({ userId, type, label, dedupeKey, status: 'queued' })
  }

  // Never throws - callers invoke this without awaiting it (fire-and-forget)
  // right after create(), so there's nothing to catch a rejection with.
  async run(jobId: string, fn: () => Promise<string[]>): Promise<void> {
    await this.jobModel.updateOne({ _id: jobId }, { $set: { status: 'running', startedAt: new Date() } }).exec()
    try {
      const resultRecipeIds = await fn()
      await this.jobModel.updateOne(
        { _id: jobId },
        { $set: { status: 'done', finishedAt: new Date(), resultRecipeIds } },
      ).exec()
    } catch (err) {
      await this.jobModel.updateOne(
        { _id: jobId },
        { $set: { status: 'failed', finishedAt: new Date(), error: err instanceof Error ? err.message : 'Unknown error' } },
      ).exec()
    }
  }

  async listMine(userId: string, activeOnly = false): Promise<JobDocument[]> {
    const filter: FilterQuery<JobDocument> = { userId }
    if (activeOnly) filter.status = { $in: ['queued', 'running'] }
    return this.jobModel.find(filter).sort({ createdAt: -1 }).limit(50).exec()
  }
}
