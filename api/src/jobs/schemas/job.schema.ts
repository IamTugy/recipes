import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type JobDocument = Job & Document

export type JobType = 'import' | 'ai_generate'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

// virtuals: true so the "id" virtual (string form of _id) shows up in
// .toObject()/.toJSON() output - see recipe.schema.ts for the full story.
@Schema({ timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } })
export class Job {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, enum: ['import', 'ai_generate'] })
  type!: JobType

  @Prop({ required: true, enum: ['queued', 'running', 'done', 'failed'], default: 'queued', index: true })
  status!: JobStatus

  // Human-readable description shown in the toast/jobs page - the source
  // URL/filename for imports, the query text for AI-generate.
  @Prop()
  label?: string

  // No result payload is stored here - a finished job just points at
  // recipes that already exist in the Recipe collection (created as
  // pendingReview drafts), so the jobs page and toast link straight to them.
  @Prop({ type: [String], default: [] })
  resultRecipeIds!: string[]

  @Prop()
  error?: string

  @Prop()
  startedAt?: Date

  @Prop()
  finishedAt?: Date

  // Fingerprint of the submission (hash of the source URL/text/file for
  // imports, the trimmed query for AI-generate) - lets create() detect "the
  // same user already has an in-flight or just-finished job for this exact
  // source" and return it instead of starting a duplicate run.
  @Prop({ index: true })
  dedupeKey?: string
}

export const JobSchema = SchemaFactory.createForClass(Job)

// Closes the TOCTOU race in JobsService.create()'s dedupe check: two
// concurrent requests with the same userId+dedupeKey could both pass the
// findOne() before either create() lands, producing two "queued" jobs for
// the same submission - exactly the duplicate-work bug dedupeKey exists to
// prevent. This unique index makes the second concurrent insert fail at the
// database level instead; create() catches that failure and re-fetches the
// job the other request just created. Partial (queued/running only) because
// a `done`/`failed` job is allowed to coexist with a later resubmission -
// only truly concurrent in-flight submissions need to collide.
JobSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true }, status: { $in: ['queued', 'running'] } } },
)
