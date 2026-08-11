import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model } from 'mongoose'
import { Job, JobDocument, JobType } from './schemas/job.schema'

const DEDUPE_WINDOW_MS = 10 * 60 * 1000
const STALE_JOB_MS = 20 * 60 * 1000

@Injectable()
export class JobsService implements OnModuleInit {
  constructor(@InjectModel(Job.name) private readonly jobModel: Model<JobDocument>) {}

  // A fire-and-forget background task has no way to survive a pod restart -
  // this app redeploys frequently, so a job stuck mid-flight when the
  // process dies would otherwise sit as "running" forever with no way for
  // the frontend to know it's actually dead. Same "backfill on boot"
  // pattern as RecipesService.onModuleInit.
  //
  // This is scoped by age rather than sweeping every queued/running job:
  // the k8s deployment is replicas:1 with a RollingUpdate strategy, which
  // brings the new pod up (running this sweep) before the old pod
  // terminates - an unscoped sweep would mark jobs still genuinely running
  // on the old pod as falsely "failed" on every routine deploy, and a user
  // retrying that false failure is exactly the duplicate-work bug dedupeKey
  // exists to prevent. Only jobs stuck well beyond any realistic runtime are
  // swept. A job could be `queued` if the process died between create() and
  // run()'s first updateOne, hence checking createdAt for that status too.
  async onModuleInit(): Promise<void> {
    const staleCutoff = new Date(Date.now() - STALE_JOB_MS)
    await this.jobModel.updateMany(
      {
        $or: [
          { status: 'queued', createdAt: { $lt: staleCutoff } },
          { status: 'running', startedAt: { $lt: staleCutoff } },
        ],
      },
      { $set: { status: 'failed', finishedAt: new Date(), error: 'Interrupted by a server restart - please retry.' } },
    )
  }

  // dedupeKey lets a caller avoid starting a duplicate run of the same
  // submission (e.g. a user retrying an import that looked like it failed
  // client-side while it was actually still running server-side) - if the
  // same user already has an in-flight job, or one that finished within the
  // last 10 minutes, for the same dedupeKey, that job is returned instead of
  // starting a new one. `failed` jobs are excluded from the match window -
  // a genuine failure should be immediately retryable, not silently
  // swallowed into a no-op for 10 minutes.
  //
  // isExisting tells the caller whether the returned job is brand new (and
  // needs run() started) or a pre-existing in-flight/recent job (which is
  // already being worked, or already resolved, and must NOT be started
  // again - starting it again is exactly the duplicate-work bug dedupeKey
  // exists to prevent).
  async create(
    userId: string,
    type: JobType,
    label?: string,
    dedupeKey?: string,
  ): Promise<{ job: JobDocument; isExisting: boolean }> {
    if (dedupeKey) {
      const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS)
      const existing = await this.jobModel
        .findOne({
          userId,
          dedupeKey,
          $or: [
            { status: { $in: ['queued', 'running'] } },
            { status: 'done', finishedAt: { $gte: cutoff } },
          ],
        })
        .sort({ createdAt: -1 })
        .exec()
      if (existing) return { job: existing, isExisting: true }
    }
    const job = await this.jobModel.create({ userId, type, label, dedupeKey, status: 'queued' })
    return { job, isExisting: false }
  }

  // Never throws - callers invoke this without awaiting it (fire-and-forget)
  // right after create(), so there's nothing to catch a rejection with. The
  // entire body (including the initial "set to running" update) is inside
  // the try/catch: if that first updateOne rejects (e.g. a transient Mongo
  // blip) with no handler on the fire-and-forget call, Node's default
  // unhandled-rejection behavior would crash the whole process, killing
  // every other in-flight job on the pod too.
  async run(jobId: string, fn: () => Promise<string[]>): Promise<void> {
    try {
      await this.jobModel.updateOne({ _id: jobId }, { $set: { status: 'running', startedAt: new Date() } }).exec()
      const resultRecipeIds = await fn()
      await this.jobModel.updateOne(
        { _id: jobId },
        { $set: { status: 'done', finishedAt: new Date(), resultRecipeIds } },
      ).exec()
    } catch (err) {
      try {
        await this.jobModel.updateOne(
          { _id: jobId },
          { $set: { status: 'failed', finishedAt: new Date(), error: err instanceof Error ? err.message : 'Unknown error' } },
        ).exec()
      } catch {
        // If even the failure-write fails, there's nothing more this method
        // can do - it must not throw regardless, since callers invoke it
        // fire-and-forget.
      }
    }
  }

  async listMine(userId: string, activeOnly = false): Promise<JobDocument[]> {
    const filter: FilterQuery<JobDocument> = { userId }
    if (activeOnly) filter.status = { $in: ['queued', 'running'] }
    return this.jobModel.find(filter).sort({ createdAt: -1 }).limit(50).exec()
  }
}
