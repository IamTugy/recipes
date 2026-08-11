# Async Recipe Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert recipe import (`POST /recipes/import`) and AI-generate (`POST /recipes/ai-generate`) from synchronous, page-blocking requests into background jobs that return instantly, with a toast that updates from progress to result, a dedupe guard against duplicate submissions, and a `/jobs` page listing history.

**Architecture:** A new `JobsService` (Mongo-backed, no new infra) wraps the existing import/generate business logic: the endpoint creates a `Job` row and fires the work without awaiting it, returning `{ jobId }` immediately. A global frontend watcher polls for active jobs and drives a toast (using `@base-ui/react`'s toast manager's `update()` to flip a sticky "in progress" toast into a final success/error state in place) regardless of which page the user is on.

**Tech Stack:** NestJS (`api/`), Mongoose, React/Vite (`src/`), `@base-ui/react` Toast, Jest.

## Global Constraints

- No new infrastructure (no Redis queue, no BullMQ) - jobs are a plain Mongo collection, processed via fire-and-forget async calls in the same Node process.
- A fire-and-forget job has no way to survive a pod restart - `JobsService.onModuleInit` must mark any `queued`/`running` job `failed` on every boot (this app redeploys frequently).
- Every import/generate submission gets a `dedupeKey`; `JobsService.create` returns an existing in-flight-or-recent job for the same user+key instead of starting a duplicate run - this is a direct fix for a real incident (a timed-out client retry left 5 background runs completing invisibly, producing 74 duplicate recipes from one PDF).
- Single-recipe imports now always persist as a `pendingReview` draft with a `batchId`, same as the existing multi-recipe path - the old "return the unsaved recipe for live prefill" special case is removed, since the async model means the user isn't sitting on the page waiting for a hand-off.
- `GET /jobs` returns the current user's jobs, newest-first, capped at 50.
- Real-time push (SSE/WebSocket) is explicitly out of scope - polling only.

---

### Task 1: Job schema + JobsService + JobsController

**Files:**
- Create: `api/src/jobs/schemas/job.schema.ts`
- Create: `api/src/jobs/jobs.service.ts`
- Test: `api/src/jobs/jobs.service.spec.ts`
- Create: `api/src/jobs/jobs.controller.ts`
- Test: `api/src/jobs/jobs.controller.spec.ts`
- Create: `api/src/jobs/jobs.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Produces (used by Tasks 2-3): `JobsService.create(userId: string, type: 'import' | 'ai_generate', label?: string, dedupeKey?: string): Promise<JobDocument>`, `JobsService.run(jobId: string, fn: () => Promise<string[]>): Promise<void>`.
- Produces (used by Task 4+, via `GET /jobs`): `JobsService.listMine(userId: string, activeOnly?: boolean): Promise<JobDocument[]>`, exposed as `GET /jobs` and `GET /jobs?status=active`.

- [ ] **Step 1: Create the Job schema**

Create `api/src/jobs/schemas/job.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type JobDocument = Job & Document

export type JobType = 'import' | 'ai_generate'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

@Schema({ timestamps: true })
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
```

- [ ] **Step 2: Write the failing tests for JobsService**

Create `api/src/jobs/jobs.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { JobsService } from './jobs.service'
import { Job } from './schemas/job.schema'

describe('JobsService', () => {
  async function makeService(model: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [JobsService, { provide: getModelToken(Job.name), useValue: model }],
    }).compile()
    return moduleRef.get(JobsService)
  }

  it('onModuleInit marks any queued/running job as failed', async () => {
    const updateMany = jest.fn().mockResolvedValue({})
    const service = await makeService({ updateMany })

    await service.onModuleInit()

    expect(updateMany).toHaveBeenCalledWith(
      { status: { $in: ['queued', 'running'] } },
      { $set: { status: 'failed', finishedAt: expect.any(Date), error: 'Interrupted by a server restart - please retry.' } },
    )
  })

  it('create without a dedupeKey always inserts a new job', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'job-1' })
    const service = await makeService({ create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf')

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', type: 'import', label: 'my-recipe.pdf', dedupeKey: undefined, status: 'queued' })
    expect(result).toEqual({ id: 'job-1' })
  })

  it('create with a dedupeKey returns an existing queued/running job for the same user instead of inserting', async () => {
    const existingJob = { id: 'job-1', status: 'running' }
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existingJob) })
    const findOne = jest.fn().mockReturnValue({ sort })
    const create = jest.fn()
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', dedupeKey: 'dedupe-abc' }))
    expect(create).not.toHaveBeenCalled()
    expect(result).toBe(existingJob)
  })

  it('create with a dedupeKey inserts a new job when no matching job is found', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const findOne = jest.fn().mockReturnValue({ sort })
    const create = jest.fn().mockResolvedValue({ id: 'job-2' })
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', type: 'import', label: 'my-recipe.pdf', dedupeKey: 'dedupe-abc', status: 'queued' })
    expect(result).toEqual({ id: 'job-2' })
  })

  it('run sets status to running then done with the result ids on success', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await service.run('job-1', async () => ['recipe-a', 'recipe-b'])

    expect(updateOne).toHaveBeenNthCalledWith(1, { _id: 'job-1' }, { $set: { status: 'running', startedAt: expect.any(Date) } })
    expect(updateOne).toHaveBeenNthCalledWith(2, { _id: 'job-1' }, { $set: { status: 'done', finishedAt: expect.any(Date), resultRecipeIds: ['recipe-a', 'recipe-b'] } })
  })

  it('run sets status to failed with the error message when the work throws', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await service.run('job-1', async () => { throw new Error('extraction failed') })

    expect(updateOne).toHaveBeenNthCalledWith(2, { _id: 'job-1' }, { $set: { status: 'failed', finishedAt: expect.any(Date), error: 'extraction failed' } })
  })

  it('run never throws even when the work rejects', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await expect(service.run('job-1', async () => { throw new Error('boom') })).resolves.toBeUndefined()
  })

  it('listMine returns the user\'s jobs sorted newest-first, capped at 50', async () => {
    const exec = jest.fn().mockResolvedValue([{ id: 'job-1' }])
    const limit = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    const result = await service.listMine('user_1')

    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(limit).toHaveBeenCalledWith(50)
    expect(result).toEqual([{ id: 'job-1' }])
  })

  it('listMine with activeOnly filters to queued/running jobs', async () => {
    const exec = jest.fn().mockResolvedValue([])
    const limit = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    await service.listMine('user_1', true)

    expect(find).toHaveBeenCalledWith({ userId: 'user_1', status: { $in: ['queued', 'running'] } })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api && npx jest src/jobs/jobs.service.spec.ts`
Expected: FAIL with "Cannot find module './jobs.service'"

- [ ] **Step 4: Write the JobsService implementation**

Create `api/src/jobs/jobs.service.ts`:

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npx jest src/jobs/jobs.service.spec.ts`
Expected: PASS, all 8 tests green

- [ ] **Step 6: Write the failing tests for JobsController**

Create `api/src/jobs/jobs.controller.spec.ts`:

```typescript
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'

describe('JobsController', () => {
  const jobsService = { listMine: jest.fn() }
  const controller = new JobsController(jobsService as unknown as JobsService)

  beforeEach(() => jest.clearAllMocks())

  it('GET /jobs returns the current user\'s jobs', async () => {
    jobsService.listMine.mockResolvedValue([{ toObject: () => ({ id: 'job-1' }) }])

    const result = await controller.list(undefined, { userId: 'user_1' } as any)

    expect(jobsService.listMine).toHaveBeenCalledWith('user_1', false)
    expect(result).toEqual([{ id: 'job-1' }])
  })

  it('GET /jobs?status=active only fetches active jobs', async () => {
    jobsService.listMine.mockResolvedValue([])

    await controller.list('active', { userId: 'user_1' } as any)

    expect(jobsService.listMine).toHaveBeenCalledWith('user_1', true)
  })
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd api && npx jest src/jobs/jobs.controller.spec.ts`
Expected: FAIL with "Cannot find module './jobs.controller'"

- [ ] **Step 8: Write the JobsController and JobsModule**

Create `api/src/jobs/jobs.controller.ts`:

```typescript
import { Controller, Get, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { JobsService } from './jobs.service'

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(@Query('status') status: string | undefined, @Req() req: Request & { userId: string }) {
    const jobs = await this.jobsService.listMine(req.userId, status === 'active')
    return jobs.map(j => j.toObject())
  }
}
```

Create `api/src/jobs/jobs.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Job, JobSchema } from './schemas/job.schema'
import { JobsService } from './jobs.service'
import { JobsController } from './jobs.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }])],
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
```

In `api/src/app.module.ts`, add the import:

```typescript
import { JobsModule } from './jobs/jobs.module'
```

and add `JobsModule` to the `imports` array (alongside the other feature modules like `RecipesModule`).

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd api && npx jest src/jobs --silent`
Expected: PASS, all tests green

- [ ] **Step 10: Run the full backend suite**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green (JobsModule isn't consumed by anything yet, so nothing else should be affected)

- [ ] **Step 11: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/jobs api/src/app.module.ts
git commit -m "feat: add Job schema, JobsService, and GET /jobs endpoint"
```

---

### Task 2: Convert recipe import to a background job

**Files:**
- Modify: `api/src/recipes/recipes.module.ts`
- Modify: `api/src/recipes/import/recipe-import.controller.ts`
- Modify: `api/src/recipes/import/recipe-import.controller.spec.ts`

**Interfaces:**
- Consumes: `JobsService.create`/`run` from Task 1.
- Produces (used by Task 6 frontend): `RecipeImportController.import` now returns `{ jobId: string }` synchronously instead of the imported recipe(s).

- [ ] **Step 1: Wire JobsModule into RecipesModule**

In `api/src/recipes/recipes.module.ts`, add the import:

```typescript
import { JobsModule } from '../jobs/jobs.module'
```

Add `JobsModule` to the `imports` array (alongside `ActivityLogModule`, `CookLogModule`, `UsersModule`, `AiModule`).

- [ ] **Step 2: Rewrite the controller test file for the new contract**

Replace the entire contents of `api/src/recipes/import/recipe-import.controller.spec.ts` with:

```typescript
import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { JobsService } from '../../jobs/jobs.service'

describe('RecipeImportController', () => {
  const importService = {
    importFromText: jest.fn(),
    importFromUrl: jest.fn(),
    importFromFile: jest.fn(),
    importFromImage: jest.fn(),
    resolveLinks: jest.fn(),
  }
  const recipesService = { createDraft: jest.fn(), updateDraft: jest.fn(), findLinkCandidates: jest.fn() }
  const activityLog = { record: jest.fn() }
  const jobsService = { create: jest.fn(), run: jest.fn() }
  const controller = new RecipeImportController(
    importService as unknown as RecipeImportService,
    recipesService as unknown as RecipesService,
    activityLog as unknown as ActivityLogService,
    jobsService as unknown as JobsService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    recipesService.findLinkCandidates.mockResolvedValue([])
    importService.resolveLinks.mockResolvedValue([])
  })

  describe('import() - job creation', () => {
    it('creates a job and returns its id immediately without waiting for the import to finish', async () => {
      jobsService.create.mockResolvedValue({ id: 'job-1' })
      jobsService.run.mockReturnValue(new Promise(() => {})) // never resolves during the test

      const result = await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)

      expect(result).toEqual({ jobId: 'job-1' })
      expect(jobsService.create).toHaveBeenCalledWith('user_1', 'import', expect.any(String), expect.any(String))
      expect(jobsService.run).toHaveBeenCalledWith('job-1', expect.any(Function))
    })

    it('throws BadRequestException when no source is provided, without creating a job', async () => {
      await expect(controller.import({}, { userId: 'user_1' } as any, undefined)).rejects.toThrow(BadRequestException)
      expect(jobsService.create).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when a url is combined with a file or a photo', async () => {
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File
      await expect(controller.import({ url: 'https://example.com' }, { userId: 'user_1' } as any, { file: [file] })).rejects.toThrow(BadRequestException)
      await expect(controller.import({ url: 'https://example.com' }, { userId: 'user_1' } as any, { image: [image] })).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when a file and a photo are both provided', async () => {
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File
      await expect(controller.import({}, { userId: 'user_1' } as any, { file: [file], image: [image] })).rejects.toThrow(BadRequestException)
    })

    it('uses the same dedupeKey for two identical text submissions and a different key for a different source', async () => {
      jobsService.create.mockResolvedValue({ id: 'job-1' })
      jobsService.run.mockReturnValue(new Promise(() => {}))

      await controller.import({ text: 'same text' }, { userId: 'user_1' } as any, undefined)
      await controller.import({ text: 'same text' }, { userId: 'user_1' } as any, undefined)
      await controller.import({ text: 'different text' }, { userId: 'user_1' } as any, undefined)

      const keys = jobsService.create.mock.calls.map(call => call[3])
      expect(keys[0]).toBe(keys[1])
      expect(keys[0]).not.toBe(keys[2])
    })
  })

  describe('runImport() - the actual import work', () => {
    function runImport(body: { text?: string; url?: string }, files?: { file?: Express.Multer.File; image?: Express.Multer.File }) {
      return (controller as any).runImport(body, 'user_1', files?.file, files?.image)
    }

    it('imports from text when only text is provided', async () => {
      importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      const result = await runImport({ text: 'some recipe text' })

      expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
      expect(result).toEqual(['a'])
    })

    it('imports from url when only url is provided', async () => {
      importService.importFromUrl.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runImport({ url: 'https://example.com/soup' })

      expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup', undefined)
    })

    it('imports from url with the caption text combined when a social share provides both', async () => {
      importService.importFromUrl.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runImport({ url: 'https://www.instagram.com/reel/abc', text: 'Best soup ever, recipe below' })

      expect(importService.importFromUrl).toHaveBeenCalledWith('https://www.instagram.com/reel/abc', 'Best soup ever, recipe below')
    })

    it('imports from file when only a file is provided', async () => {
      importService.importFromFile.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      await runImport({}, { file })

      expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf', undefined)
    })

    it('imports from file with the prompt text combined when both are provided', async () => {
      importService.importFromFile.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      await runImport({ text: 'make it vegan' }, { file })

      expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf', 'make it vegan')
    })

    it('imports from a photo when only an image is provided', async () => {
      importService.importFromImage.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File

      await runImport({}, { image })

      expect(importService.importFromImage).toHaveBeenCalledWith(image.buffer, 'image/jpeg', undefined)
    })

    it('imports from a photo with the prompt text combined when both are provided', async () => {
      importService.importFromImage.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File

      await runImport({ text: 'make it vegan' }, { image })

      expect(importService.importFromImage).toHaveBeenCalledWith(image.buffer, 'image/jpeg', 'make it vegan')
    })

    it('logs an ai_recipe_import_used event after a successful import', async () => {
      importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runImport({ text: 'some recipe text' })

      expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_import_used')
    })

    it('always persists a single found recipe as a pending-review draft, returning its id (no more unsaved pass-through)', async () => {
      importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      const result = await runImport({ text: 'some recipe text' })

      expect(recipesService.createDraft).toHaveBeenCalledWith('user_1', expect.objectContaining({ title: 'Soup' }), { pendingReview: true, batchId: expect.any(String) })
      expect(result).toEqual(['a'])
    })

    it('persists multiple found recipes as pending-review drafts sharing one batchId', async () => {
      importService.importFromFile.mockResolvedValue([
        { title: 'Salad' },
        { title: 'Spring Rolls' },
        { title: 'Pho' },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Salad' }) })
        .mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Spring Rolls' }) })
        .mockResolvedValueOnce({ id: 'c', toObject: () => ({ id: 'c', title: 'Pho' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      const result = await runImport({}, { file })

      expect(recipesService.createDraft).toHaveBeenCalledTimes(3)
      expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
      expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
      expect(recipesService.createDraft.mock.calls[2][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('skips a malformed recipe in a multi-recipe batch but still persists the valid ones', async () => {
      importService.importFromFile.mockResolvedValue([
        {}, // no title -> fails validation
        { title: 'Spring Rolls' },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Spring Rolls' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      const result = await runImport({}, { file })

      expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['b'])
    })

    it('throws BadRequestException without persisting anything when every recipe in a multi-recipe batch fails validation', async () => {
      importService.importFromFile.mockResolvedValue([{}, {}])
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      await expect(runImport({}, { file })).rejects.toThrow(BadRequestException)
      expect(recipesService.createDraft).not.toHaveBeenCalled()
    })

    it('links a single imported recipe\'s ingredient to an existing app recipe when a confident match is found', async () => {
      importService.importFromText.mockResolvedValue([
        { title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce' }] }] },
      ])
      recipesService.findLinkCandidates.mockResolvedValue([{ id: 'existing-1', title: 'Peanut Dipping Sauce' }])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Spring Rolls' }) })

      await runImport({ text: 'spring rolls recipe' })

      expect(importService.resolveLinks).toHaveBeenCalledWith(
        [{ title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'existing-1' }] }] }],
        [{ id: 'existing-1', title: 'Peanut Dipping Sauce' }],
      )
    })

    it('links a dish to its sauce within the same batch after both are created', async () => {
      importService.importFromFile.mockResolvedValue([
        { title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce' }] }] },
        { title: 'Dipping Sauce', ingredients: [{ items: [{ name: 'fish sauce' }] }] },
      ])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToRecipeIndex: 1 },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'rolls-id', toObject: () => ({ id: 'rolls-id', title: 'Spring Rolls' }) })
        .mockResolvedValueOnce({ id: 'sauce-id', toObject: () => ({ id: 'sauce-id', title: 'Dipping Sauce' }) })
      recipesService.updateDraft.mockResolvedValue({ toObject: () => ({ id: 'rolls-id', title: 'Spring Rolls', linked: true }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      const result = await runImport({}, { file })

      expect(recipesService.updateDraft).toHaveBeenCalledWith(
        'rolls-id',
        'user_1',
        false,
        expect.objectContaining({ ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'sauce-id' }] }] }),
      )
      expect(result).toEqual(['rolls-id', 'sauce-id'])
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api && npx jest src/recipes/import/recipe-import.controller.spec.ts`
Expected: FAIL - the controller's `import()` still returns recipe data directly and has no `runImport` method, and its constructor doesn't accept a `JobsService`.

- [ ] **Step 4: Rewrite the controller**

Replace the entire contents of `api/src/recipes/import/recipe-import.controller.ts` with:

```typescript
import { Body, Controller, Post, BadRequestException, Logger, Req, UploadedFiles, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { randomUUID, createHash } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeImportService, applyRecipeLink, type LinkMatch } from './recipe-import.service'
import type { ImportedRecipe } from './source-extractor'
import { RecipesService } from '../recipes.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { JobsService } from '../../jobs/jobs.service'

// Mirrors RecipeAiGenerateController's toDraftDto - this batch is constructed
// in-process from Gemini output, never bound from an HTTP body, so it must be
// validated manually rather than relying on the global ValidationPipe.
function toDraftDto(recipe: ImportedRecipe): SaveRecipeDraftDto {
  return plainToInstance(SaveRecipeDraftDto, recipe)
}

function dedupeKeyFor(body: { text?: string; url?: string }, file?: Express.Multer.File, image?: Express.Multer.File): string {
  const parts = [
    body.url,
    body.text,
    file ? `file:${file.originalname}:${file.size}` : undefined,
    image ? `image:${image.originalname}:${image.size}` : undefined,
  ].filter(Boolean)
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function labelFor(body: { text?: string; url?: string }, file?: Express.Multer.File, image?: Express.Multer.File): string {
  if (body.url) return body.url
  if (file) return file.originalname
  if (image) return image.originalname
  return (body.text ?? '').slice(0, 80) || 'Recipe import'
}

@Controller('recipes/import')
export class RecipeImportController {
  private readonly logger = new Logger(RecipeImportController.name)

  constructor(
    private readonly importService: RecipeImportService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
    private readonly jobsService: JobsService,
  ) {}

  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]))
  async import(
    @Body() body: { text?: string; url?: string },
    @Req() req: Request & { userId: string },
    @UploadedFiles() files?: { file?: Express.Multer.File[]; image?: Express.Multer.File[] },
  ): Promise<{ jobId: string }> {
    const file = files?.file?.[0]
    const image = files?.image?.[0]

    if (!body.text && !body.url && !file && !image) {
      throw new BadRequestException('Provide text, a URL, a file, or a photo')
    }
    if (body.url && (file || image)) {
      throw new BadRequestException('Provide a URL on its own or with caption text, not combined with a file or a photo')
    }
    if (file && image) {
      throw new BadRequestException('Provide a document file or a photo, not both')
    }

    const userId = req.userId
    const job = await this.jobsService.create(userId, 'import', labelFor(body, file, image), dedupeKeyFor(body, file, image))
    void this.jobsService.run(job.id, () => this.runImport(body, userId, file, image))
    return { jobId: job.id }
  }

  // Spot ingredients that are really references to another whole recipe -
  // either another recipe in this same batch (a dish and its separately
  // extracted sauce) or one already in the app (published, or the user's
  // own). Matches against existing recipes are applied immediately; a match
  // within the batch can't be applied yet since the target recipe doesn't
  // have a real id until it's created below. Every result - one recipe or
  // many - is persisted as a pendingReview draft sharing one batchId; there
  // is no more "single recipe returns unsaved for live prefill" path, since
  // the async model means the caller isn't waiting on this page for a
  // hand-off.
  private async runImport(
    body: { text?: string; url?: string },
    userId: string,
    file?: Express.Multer.File,
    image?: Express.Multer.File,
  ): Promise<string[]> {
    const recipes = body.url
      ? await this.importService.importFromUrl(body.url, body.text)
      : file
        ? await this.importService.importFromFile(file.buffer, file.mimetype, body.text)
        : image
          ? await this.importService.importFromImage(image.buffer, image.mimetype, body.text)
          : await this.importService.importFromText(body.text!)

    await this.activityLog.record(userId, undefined, 'ai_recipe_import_used')

    const candidates = await this.recipesService.findLinkCandidates(userId)
    const links = await this.importService.resolveLinks(recipes, candidates)
    for (const link of links) {
      if (!link.linkToExistingId) continue
      const recipe = recipes[link.recipeIndex]
      if (recipe) applyRecipeLink(recipe, link.groupIndex, link.itemIndex, link.linkToExistingId)
    }

    const validByOriginalIndex = new Map<number, SaveRecipeDraftDto>()
    for (const [index, recipe] of recipes.entries()) {
      const dto = toDraftDto(recipe)
      const errors = await validate(dto, { whitelist: true })
      if (errors.length > 0) {
        this.logger.warn(
          `Skipping malformed imported recipe "${recipe.title ?? '(untitled)'}": ${errors.map(e => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
        )
        continue
      }
      validByOriginalIndex.set(index, dto)
    }
    if (validByOriginalIndex.size === 0) {
      throw new BadRequestException('Import produced no usable recipes')
    }

    const batchId = randomUUID()
    const idByOriginalIndex = new Map<number, string>()
    const createdIds: string[] = []
    for (const [index, dto] of validByOriginalIndex) {
      const recipe = await this.recipesService.createDraft(userId, dto, { pendingReview: true, batchId })
      idByOriginalIndex.set(index, recipe.id)
      createdIds.push(recipe.id)
    }

    const withinBatchLinks = links.filter((l): l is LinkMatch & { linkToRecipeIndex: number } => l.linkToRecipeIndex !== undefined)
    for (const link of withinBatchLinks) {
      const sourceDto = validByOriginalIndex.get(link.recipeIndex)
      const sourceId = idByOriginalIndex.get(link.recipeIndex)
      const targetId = idByOriginalIndex.get(link.linkToRecipeIndex)
      if (!sourceDto || !sourceId || !targetId) continue
      const item = sourceDto.ingredients?.[link.groupIndex]?.items?.[link.itemIndex]
      if (!item) continue
      item.linkedRecipeId = targetId
      try {
        await this.recipesService.updateDraft(sourceId, userId, false, sourceDto)
      } catch (err) {
        // A cycle or other guard tripping here means the match was wrong -
        // leave that one recipe unlinked rather than failing the whole batch.
        this.logger.warn(`Could not apply within-batch recipe link for "${sourceDto.title}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return createdIds
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npx jest src/recipes/import/recipe-import.controller.spec.ts`
Expected: PASS, all tests green

- [ ] **Step 6: Run the full backend suite**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green

- [ ] **Step 7: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/recipes.module.ts api/src/recipes/import/recipe-import.controller.ts api/src/recipes/import/recipe-import.controller.spec.ts
git commit -m "feat: convert recipe import to a background job"
```

---

### Task 3: Convert AI-generate to a background job

**Files:**
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.controller.ts`
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`

**Interfaces:**
- Consumes: `JobsService.create`/`run` from Task 1 (already wired into `RecipesModule` by Task 2).
- Produces (used by Task 6 frontend): `RecipeAiGenerateController.generate` now returns `{ jobId: string }` synchronously instead of the generated recipe(s).

- [ ] **Step 1: Rewrite the controller test file for the new contract**

Replace the entire contents of `api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts` with:

```typescript
import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { RecipeImportService } from '../import/recipe-import.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { JobsService } from '../../jobs/jobs.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const importService = { resolveLinks: jest.fn() }
  const recipesService = { createDraft: jest.fn(), updateDraft: jest.fn(), findLinkCandidates: jest.fn() }
  const activityLog = { record: jest.fn() }
  const jobsService = { create: jest.fn(), run: jest.fn() }
  const controller = new RecipeAiGenerateController(
    aiGenerateService as unknown as RecipeAiGenerateService,
    importService as unknown as RecipeImportService,
    recipesService as unknown as RecipesService,
    activityLog as unknown as ActivityLogService,
    jobsService as unknown as JobsService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    recipesService.findLinkCandidates.mockResolvedValue([])
    importService.resolveLinks.mockResolvedValue([])
  })

  describe('generate() - job creation', () => {
    it('creates a job and returns its id immediately without waiting for generation to finish', async () => {
      jobsService.create.mockResolvedValue({ id: 'job-1' })
      jobsService.run.mockReturnValue(new Promise(() => {})) // never resolves during the test

      const result = await controller.generate({ query: 'chocolate cake' }, { userId: 'user_1' } as any)

      expect(result).toEqual({ jobId: 'job-1' })
      expect(jobsService.create).toHaveBeenCalledWith('user_1', 'ai_generate', 'chocolate cake', expect.any(String))
      expect(jobsService.run).toHaveBeenCalledWith('job-1', expect.any(Function))
    })

    it('throws BadRequestException when no query is provided, without creating a job', async () => {
      await expect(controller.generate({}, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
      expect(jobsService.create).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when the query is blank', async () => {
      await expect(controller.generate({ query: '   ' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
    })

    it('uses the same dedupeKey for the same query regardless of casing/whitespace', async () => {
      jobsService.create.mockResolvedValue({ id: 'job-1' })
      jobsService.run.mockReturnValue(new Promise(() => {}))

      await controller.generate({ query: 'Chocolate Cake' }, { userId: 'user_1' } as any)
      await controller.generate({ query: '  chocolate cake  ' }, { userId: 'user_1' } as any)

      const keys = jobsService.create.mock.calls.map(call => call[3])
      expect(keys[0]).toBe(keys[1])
    })
  })

  describe('runGenerate() - the actual generation work', () => {
    function runGenerate(query: string) {
      return (controller as any).runGenerate(query, 'user_1')
    }

    it('generates then persists each recipe as a pending-review draft sharing one batchId', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { title: 'Chocolate Cake', aiGenerated: true, sources: [] },
        { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })
        .mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

      const result = await runGenerate('chocolate cake and vanilla frosting')

      expect(recipesService.createDraft).toHaveBeenCalledTimes(2)
      expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
      expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
      expect(recipesService.createDraft.mock.calls[0][0]).toBe('user_1')
      expect(result).toEqual(['a', 'b'])
    })

    it('logs an ai_recipe_generate_used event with the batch size after a successful generation', async () => {
      aiGenerateService.generate.mockResolvedValue([{ title: 'Soup', aiGenerated: true, sources: [] }])
      recipesService.createDraft.mockResolvedValue({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runGenerate('tomato soup')

      expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used', { count: 1 })
    })

    it('skips a malformed generated recipe (missing title) but still persists and returns the other valid one(s) in the batch', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { aiGenerated: true, sources: [] }, // no title -> fails validation
        { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

      const result = await runGenerate('vanilla frosting')

      expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['b'])
    })

    it('throws BadRequestException without persisting anything when every recipe in the batch fails validation', async () => {
      aiGenerateService.generate.mockResolvedValue([{ aiGenerated: true, sources: [] }])

      await expect(runGenerate('anything')).rejects.toThrow(BadRequestException)
      expect(recipesService.createDraft).not.toHaveBeenCalled()
    })

    it('links a generated recipe to an existing app recipe when resolveLinks finds a confident match', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { title: 'Chocolate Cake', aiGenerated: true, sources: [], ingredients: [{ items: [{ name: 'vanilla frosting' }] }] },
      ])
      recipesService.findLinkCandidates.mockResolvedValue([{ id: 'existing-1', title: 'Vanilla Frosting' }])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })

      await runGenerate('chocolate cake')

      expect(recipesService.createDraft.mock.calls[0][1].ingredients).toEqual([
        { items: [{ name: 'vanilla frosting', linkedRecipeId: 'existing-1' }] },
      ])
    })

    it('links two recipes generated in the same batch to each other after both are created', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { title: 'Chocolate Cake', aiGenerated: true, sources: [], ingredients: [{ items: [{ name: 'vanilla frosting' }] }] },
        { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
      ])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToRecipeIndex: 1 },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'cake-id', toObject: () => ({ id: 'cake-id', title: 'Chocolate Cake' }) })
        .mockResolvedValueOnce({ id: 'frosting-id', toObject: () => ({ id: 'frosting-id', title: 'Vanilla Frosting' }) })
      recipesService.updateDraft.mockResolvedValue({ toObject: () => ({ id: 'cake-id', title: 'Chocolate Cake', linked: true }) })

      const result = await runGenerate('chocolate cake and vanilla frosting')

      expect(recipesService.updateDraft).toHaveBeenCalledWith(
        'cake-id',
        'user_1',
        false,
        expect.objectContaining({ ingredients: [{ items: [{ name: 'vanilla frosting', linkedRecipeId: 'frosting-id' }] }] }),
      )
      expect(result).toEqual(['cake-id', 'frosting-id'])
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`
Expected: FAIL - the controller's `generate()` still returns recipe data directly and has no `runGenerate` method, and its constructor doesn't accept a `JobsService`.

- [ ] **Step 3: Rewrite the controller**

Replace the entire contents of `api/src/recipes/ai-generate/recipe-ai-generate.controller.ts` with:

```typescript
import { Body, Controller, Post, BadRequestException, Logger, Req } from '@nestjs/common'
import { Request } from 'express'
import { randomUUID, createHash } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeAiGenerateService, type AiGeneratedRecipe } from './recipe-ai-generate.service'
import { RecipeImportService, applyRecipeLink, type LinkMatch } from '../import/recipe-import.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'
import { JobsService } from '../../jobs/jobs.service'

// The generated recipe's fields (title, ingredients, steps, ...) line up
// with SaveRecipeDraftDto's, but this is constructed in-process (never bound
// from an HTTP body), so unlike the client-facing create/update routes the
// global ValidationPipe never runs on it automatically - callers must
// validate it themselves. See runGenerate() below.
function toDraftDto(recipe: AiGeneratedRecipe): SaveRecipeDraftDto {
  return plainToInstance(SaveRecipeDraftDto, recipe)
}

function dedupeKeyFor(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex')
}

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
  private readonly logger = new Logger(RecipeAiGenerateController.name)

  constructor(
    private readonly aiGenerateService: RecipeAiGenerateService,
    private readonly importService: RecipeImportService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
    private readonly jobsService: JobsService,
  ) {}

  @Post()
  async generate(@Body() body: { query?: string }, @Req() req: Request & { userId: string }): Promise<{ jobId: string }> {
    const query = body.query?.trim()
    if (!query) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    const userId = req.userId
    const job = await this.jobsService.create(userId, 'ai_generate', query, dedupeKeyFor(query))
    void this.jobsService.run(job.id, () => this.runGenerate(query, userId))
    return { jobId: job.id }
  }

  private async runGenerate(query: string, userId: string): Promise<string[]> {
    const generated = await this.aiGenerateService.generate(query)

    // Same "ingredient that's really a reference to another whole recipe"
    // matching used by manual/file import (see RecipeImportController) -
    // e.g. "chocolate cake and vanilla frosting" generating a frosting
    // ingredient item that should link to the frosting recipe generated in
    // the same batch, or to an existing recipe already in the app.
    const candidates = await this.recipesService.findLinkCandidates(userId)
    const links = await this.importService.resolveLinks(generated, candidates)
    for (const link of links) {
      if (!link.linkToExistingId) continue
      const recipe = generated[link.recipeIndex]
      if (recipe) applyRecipeLink(recipe, link.groupIndex, link.itemIndex, link.linkToExistingId)
    }

    const validByOriginalIndex = new Map<number, SaveRecipeDraftDto>()
    for (const [index, recipe] of generated.entries()) {
      const dto = toDraftDto(recipe)
      const errors = await validate(dto, { whitelist: true })
      if (errors.length > 0) {
        this.logger.warn(
          `Skipping malformed AI-generated recipe "${recipe.title ?? '(untitled)'}": ${errors.map(e => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
        )
        continue
      }
      validByOriginalIndex.set(index, dto)
    }
    if (validByOriginalIndex.size === 0) {
      throw new BadRequestException('AI generation produced no usable recipes')
    }

    const batchId = randomUUID()
    const idByOriginalIndex = new Map<number, string>()
    const createdIds: string[] = []
    for (const [index, dto] of validByOriginalIndex) {
      const recipe = await this.recipesService.createDraft(userId, dto, { pendingReview: true, batchId })
      idByOriginalIndex.set(index, recipe.id)
      createdIds.push(recipe.id)
    }

    const withinBatchLinks = links.filter((l): l is LinkMatch & { linkToRecipeIndex: number } => l.linkToRecipeIndex !== undefined)
    for (const link of withinBatchLinks) {
      const sourceDto = validByOriginalIndex.get(link.recipeIndex)
      const sourceId = idByOriginalIndex.get(link.recipeIndex)
      const targetId = idByOriginalIndex.get(link.linkToRecipeIndex)
      if (!sourceDto || !sourceId || !targetId) continue
      const item = sourceDto.ingredients?.[link.groupIndex]?.items?.[link.itemIndex]
      if (!item) continue
      item.linkedRecipeId = targetId
      try {
        await this.recipesService.updateDraft(sourceId, userId, false, sourceDto)
      } catch (err) {
        this.logger.warn(`Could not apply within-batch recipe link for "${sourceDto.title}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    await this.activityLog.record(userId, undefined, 'ai_recipe_generate_used', { count: createdIds.length })
    return createdIds
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`
Expected: PASS, all tests green

- [ ] **Step 5: Run the full backend suite**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/ai-generate/recipe-ai-generate.controller.ts api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts
git commit -m "feat: convert recipe AI-generate to a background job"
```

---

### Task 4: Frontend data layer (types, toast extension, i18n)

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/jobs.ts`
- Modify: `src/context/toastContextObject.ts`
- Modify: `src/context/ToastContext.tsx`
- Modify: `src/i18n.ts`

**Interfaces:**
- Produces (used by Tasks 5-7): `Job` type; `fetchJobs`/`fetchActiveJobs` in `src/lib/jobs.ts`; `ToastType` now includes `'info'`; toasts can carry `data: { href?: string }` for click-to-navigate; the `tx.*` i18n keys listed in Step 4.

- [ ] **Step 1: Add the Job type**

In `src/types.ts`, append this interface at the end of the file:

```typescript
export interface Job {
  id: string
  type: 'import' | 'ai_generate'
  status: 'queued' | 'running' | 'done' | 'failed'
  label?: string
  resultRecipeIds: string[]
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}
```

- [ ] **Step 2: Add the jobs fetch helpers**

Create `src/lib/jobs.ts`:

```typescript
import { apiFetch } from './api'
import type { Job } from '../types'

export function fetchJobs(getToken: () => Promise<string | null>): Promise<Job[]> {
  return apiFetch<Job[]>('/jobs', getToken)
}

export function fetchActiveJobs(getToken: () => Promise<string | null>): Promise<Job[]> {
  return apiFetch<Job[]>('/jobs?status=active', getToken)
}
```

- [ ] **Step 3: Extend the toast system with an 'info' type and a clickable href**

Replace the entire contents of `src/context/toastContextObject.ts` with:

```typescript
import { Toast } from '@base-ui/react/toast'

export type ToastType = 'success' | 'error' | 'info'

export const TOAST_DURATION_MS = 3000

// Extra per-toast data (base-ui's generic Data slot, distinct from the
// built-in `type`/`description`/`timeout` fields) - href lets a toast be
// clickable to navigate somewhere, used by the job-progress toasts to link
// to the finished recipe once a job completes.
export interface ToastData {
  href?: string
}

/**
 * Global toast manager so `showToast` can be called from anywhere in the app
 * (event handlers, effects, etc.), not just from inside a component that
 * renders `Toast.Root`. `ToastProvider` wires this instance into
 * `Toast.Provider` via the `toastManager` prop.
 */
export const toastManager = Toast.createToastManager<ToastData>()
```

Replace the entire contents of `src/context/ToastContext.tsx` with:

```typescript
import { Toast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toastManager, TOAST_DURATION_MS } from './toastContextObject'

function ToastList() {
  const { toasts, close } = Toast.useToastManager()
  const navigate = useNavigate()

  return toasts.map(toast => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      onClick={() => {
        if (toast.data?.href) navigate(toast.data.href)
        close(toast.id)
      }}
      className={`pointer-events-auto max-w-sm px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg cursor-pointer border transition-all duration-200 data-[starting-style]:opacity-0 data-[starting-style]:translate-y-3 data-[ending-style]:opacity-0 data-[ending-style]:translate-y-3 ${
        toast.type === 'error'
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : toast.type === 'info'
            ? 'bg-amber/10 border-amber/30 text-amber'
            : 'bg-herb/10 border-herb/30 text-herb'
      }`}
    >
      <Toast.Description>{toast.description}</Toast.Description>
    </Toast.Root>
  ))
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={TOAST_DURATION_MS}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="print:hidden fixed bottom-4 inset-x-0 z-[80] flex flex-col items-center gap-2 pointer-events-none px-4">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
```

(`useToast.ts` and every existing `showToast(message, type)` call site needs no changes - `ToastType` gained a new `'info'` member but the existing `'success'`/`'error'` calls remain valid, and `data`/`href` are optional.)

- [ ] **Step 4: Add the new i18n keys**

In `src/i18n.ts`, insert these keys as the last entries of the `he` object - search for the current last key before the object's closing `},` (at the time of writing this is `clearGroupFilter: 'נקה קבוצה',` from the dish-grouping feature; if a later change added more keys after it, insert after whatever is now last) and add:

```typescript
      importStarted: 'הייבוא התחיל - נעדכן אתכם כשיסתיים',
      generationStarted: 'החיפוש התחיל - נעדכן אתכם כשיסתיים',
      jobInProgress: 'מעבד',
      jobDoneSingle: 'המתכון מוכן',
      jobDoneBatch: (n: number) => `${n} מתכונים מוכנים`,
      jobFailed: 'העיבוד נכשל',
      jobs: 'עבודות',
      jobsPageTitle: 'עבודות',
      noJobsYet: 'אין עדיין עבודות',
      jobStatusQueued: 'ממתין',
      jobStatusRunning: 'בעיבוד',
      jobStatusDone: 'הושלם',
      jobStatusFailed: 'נכשל',
      viewResult: 'צפייה בתוצאה',
```

Insert these keys as the last entries of the `en` object (same rule - after whatever is currently the last key before that object's closing `},`):

```typescript
    importStarted: 'Import started - we\'ll let you know when it\'s done',
    generationStarted: 'Search started - we\'ll let you know when it\'s done',
    jobInProgress: 'Processing',
    jobDoneSingle: 'Recipe ready',
    jobDoneBatch: (n: number) => `${n} recipes ready`,
    jobFailed: 'Processing failed',
    jobs: 'Jobs',
    jobsPageTitle: 'Jobs',
    noJobsYet: 'No jobs yet',
    jobStatusQueued: 'Queued',
    jobStatusRunning: 'Running',
    jobStatusDone: 'Done',
    jobStatusFailed: 'Failed',
    viewResult: 'View result',
```

- [ ] **Step 5: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/types.ts src/lib/jobs.ts src/context/toastContextObject.ts src/context/ToastContext.tsx src/i18n.ts
git commit -m "feat: add frontend job types, toast info/href support, and job i18n keys"
```

---

### Task 5: JobsWatcher (global progress toast)

**Files:**
- Create: `src/components/JobsWatcher.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `Job` type, `fetchActiveJobs`/`fetchJobs` from Task 4's `src/lib/jobs.ts`, `toastManager` from Task 4's extended `toastContextObject.ts`, existing `usePolling` hook (`src/hooks/usePolling.ts`).

- [ ] **Step 1: Create the JobsWatcher component**

Create `src/components/JobsWatcher.tsx`:

```typescript
import { useRef } from 'react'
import { useAuth } from '@clerk/react'
import { usePolling } from '../hooks/usePolling'
import { fetchActiveJobs, fetchJobs } from '../lib/jobs'
import { toastManager } from '../context/toastContextObject'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'

const POLL_INTERVAL_MS = 3000

// Global, mounted once outside the page-routed tree (see main.tsx) so job
// progress survives navigation - a toast started while importing a recipe
// keeps updating even if the user has already moved to another page. Also
// gives cross-device sync for free: any tab polling GET /jobs?status=active
// picks up a job in progress regardless of which device started it.
export default function JobsWatcher() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { lang } = useLanguage()
  const tx = t[lang]
  const toastIdByJobId = useRef(new Map<string, string>())

  async function poll() {
    let active
    try {
      active = await fetchActiveJobs(getToken)
    } catch {
      return
    }
    const activeIds = new Set(active.map(job => job.id))

    for (const job of active) {
      if (toastIdByJobId.current.has(job.id)) continue
      const toastId = toastManager.add({
        description: job.label ? `${tx.jobInProgress}: ${job.label}` : tx.jobInProgress,
        type: 'info',
        timeout: 0,
      })
      toastIdByJobId.current.set(job.id, toastId)
    }

    // A job this tab was showing as active that's no longer in the active
    // list just finished - fetch its final state and flip the sticky
    // progress toast into a normal auto-dismissing result toast. A job that
    // finishes between polls without ever appearing here (started and
    // finished within one 3s window, or already done on first poll from
    // another device) is intentionally not toasted retroactively - it just
    // shows up on the /jobs page.
    const finishedJobIds = [...toastIdByJobId.current.keys()].filter(id => !activeIds.has(id))
    if (finishedJobIds.length === 0) return

    let all
    try {
      all = await fetchJobs(getToken)
    } catch {
      return
    }
    for (const jobId of finishedJobIds) {
      const toastId = toastIdByJobId.current.get(jobId)
      toastIdByJobId.current.delete(jobId)
      if (!toastId) continue
      const job = all.find(j => j.id === jobId)
      if (!job) continue
      if (job.status === 'done') {
        const href = job.resultRecipeIds.length === 1 ? `/recipes/${job.resultRecipeIds[0]}/edit` : '/my-recipes'
        toastManager.update(toastId, {
          description: job.resultRecipeIds.length === 1 ? tx.jobDoneSingle : tx.jobDoneBatch(job.resultRecipeIds.length),
          type: 'success',
          timeout: 5000,
          data: { href },
        })
      } else if (job.status === 'failed') {
        toastManager.update(toastId, {
          description: job.error ?? tx.jobFailed,
          type: 'error',
          timeout: 5000,
        })
      }
    }
  }

  usePolling(poll, POLL_INTERVAL_MS, isLoaded && isSignedIn)
  return null
}
```

- [ ] **Step 2: Mount it in main.tsx**

In `src/main.tsx`, add the import:

```typescript
import JobsWatcher from './components/JobsWatcher'
```

Add `<JobsWatcher />` as a sibling right before `<App />`, inside `<ToastProvider>`:

```tsx
    <ToastProvider>
      <JobsWatcher />
      <App />
    </ToastProvider>
```

- [ ] **Step 3: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 4: Run the react-hooks lint check (matches the CI gate)**

Run:
```bash
cd /Users/tugy/git/recipes
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-report.json
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-report.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
if (hookIssues.length > 0) { console.error('React Hooks rule violations found:'); console.error(JSON.stringify(hookIssues, null, 2)); process.exit(1); }
console.log('No react-hooks violations found.');
"
```
Expected: `No react-hooks violations found.`

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/JobsWatcher.tsx src/main.tsx
git commit -m "feat: add global JobsWatcher driving progress/result toasts"
```

---

### Task 6: Update import/generate pages for the async response

**Files:**
- Modify: `src/lib/recipeImport.ts`
- Modify: `src/components/RecipeImportPage.tsx`
- Modify: `src/lib/recipeAiGenerate.ts`
- Modify: `src/components/RecipeAiGeneratePage.tsx`

**Interfaces:**
- Consumes: Task 4's `tx.importStarted`/`tx.generationStarted` i18n keys. Task 5's `JobsWatcher` picks up the resulting job automatically via polling - these pages just need to stop blocking on the result and stop expecting recipe data back.

- [ ] **Step 1: Update the import API call**

In `src/lib/recipeImport.ts`, change `importRecipe`'s signature and implementation. Replace:

```typescript
export async function importRecipe(
  input: { text?: string; url?: string; file?: File; image?: File },
  getToken: () => Promise<string | null>
): Promise<ImportedRecipe | CreatedRecipe[]> {
```

with:

```typescript
export async function importRecipe(
  input: { text?: string; url?: string; file?: File; image?: File },
  getToken: () => Promise<string | null>
): Promise<{ jobId: string }> {
```

(the function body - building `FormData`, the `fetch` call, and its error handling - stays exactly as-is; only the return type annotation changes, since the backend now genuinely returns `{ jobId }` and `res.json()` already returns whatever the backend sends). Leave the `ImportedRecipe`/`CreatedRecipe` type imports and exports in this file untouched - `NewRecipePage.tsx`/`RecipeForm.tsx` still use `ImportedRecipe` for the (now-dormant but not deleted) live-prefill code path.

- [ ] **Step 2: Update RecipeImportPage's submit handler**

In `src/components/RecipeImportPage.tsx`, replace the `handleExtract` function body. Currently:

```typescript
  async function handleExtract(overrideSource?: string) {
    const src = (overrideSource ?? trimmedSource)
    setError(null)
    setLoading(true)
    try {
      const { url, text } = splitSource(src)
      const result = await importRecipe(
        url ? { url, text } : { text: text || undefined, file: docFile ?? undefined, image: photoFile ?? undefined },
        getToken
      )
      if (Array.isArray(result)) {
        showToast(
          lang === 'he' ? `נמצאו ${result.length} מתכונים - נשמרו כטיוטות לבדיקה` : `Found ${result.length} recipes - saved as drafts for review`,
          'success'
        )
        navigate(`/recipes/${result[0].id}/edit`)
      } else {
        navigate('/recipes/new', { state: { importedDraft: result } })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError(tx.connectionFailedCheckYourInternetAnd)
      } else if (err instanceof ApiError && err.status === 413) {
        setError(lang === 'he' ? `הקובץ גדול מדי (מקסימום ${MAX_UPLOAD_MB}MB)` : `That file is too large (max ${MAX_UPLOAD_MB}MB)`)
      } else {
        setError(err instanceof Error ? err.message : (tx.importFailed))
      }
    } finally {
      setLoading(false)
    }
  }
```

Replace it with:

```typescript
  async function handleExtract(overrideSource?: string) {
    const src = (overrideSource ?? trimmedSource)
    setError(null)
    setLoading(true)
    try {
      const { url, text } = splitSource(src)
      await importRecipe(
        url ? { url, text } : { text: text || undefined, file: docFile ?? undefined, image: photoFile ?? undefined },
        getToken
      )
      showToast(tx.importStarted, 'success')
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError(tx.connectionFailedCheckYourInternetAnd)
      } else if (err instanceof ApiError && err.status === 413) {
        setError(lang === 'he' ? `הקובץ גדול מדי (מקסימום ${MAX_UPLOAD_MB}MB)` : `That file is too large (max ${MAX_UPLOAD_MB}MB)`)
      } else {
        setError(err instanceof Error ? err.message : (tx.importFailed))
      }
    } finally {
      setLoading(false)
    }
  }
```

(`showToast` is already imported/available in this file via the existing `const { showToast } = useToast()` at the top of the component - no new import needed.)

- [ ] **Step 2: Update the AI-generate API call**

In `src/lib/recipeAiGenerate.ts`, change `generateRecipesWithAi`'s signature and implementation. Replace:

```typescript
export async function generateRecipesWithAi(
  query: string,
  getToken: () => Promise<string | null>
): Promise<Recipe[]> {
```

with:

```typescript
export async function generateRecipesWithAi(
  query: string,
  getToken: () => Promise<string | null>
): Promise<{ jobId: string }> {
```

The `import type { Recipe } from '../types'` line at the top of this file becomes unused after this change - remove it.

- [ ] **Step 3: Update RecipeAiGeneratePage's submit handler**

In `src/components/RecipeAiGeneratePage.tsx`, add the import:

```typescript
import { useToast } from '../hooks/useToast'
```

Add `const { showToast } = useToast()` inside the component, right after the existing `const { lang } = useLanguage()` / `const tx = t[lang]` lines.

Replace the `handleGenerate` function body. Currently:

```typescript
  async function handleGenerate() {
    const trimmed = query.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      const created = await generateRecipesWithAi(trimmed, getToken)
      navigate(`/recipes/${created[0].id}/edit`)
    } catch (err) {
      setError(err instanceof Error ? err.message : (tx.generationFailed))
    } finally {
      setLoading(false)
    }
  }
```

Replace it with:

```typescript
  async function handleGenerate() {
    const trimmed = query.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      await generateRecipesWithAi(trimmed, getToken)
      showToast(tx.generationStarted, 'success')
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : (tx.generationFailed))
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 4: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/lib/recipeImport.ts src/components/RecipeImportPage.tsx src/lib/recipeAiGenerate.ts src/components/RecipeAiGeneratePage.tsx
git commit -m "feat: import/AI-generate pages hand off to a background job instead of blocking"
```

---

### Task 7: Jobs page

**Files:**
- Create: `src/hooks/useJobs.ts`
- Create: `src/components/JobsPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `Job` type and `fetchJobs` from Task 4's `src/lib/jobs.ts`, the `tx.jobs*`/`tx.noJobsYet`/`tx.viewResult` i18n keys from Task 4.

- [ ] **Step 1: Add the useJobs hook**

Create `src/hooks/useJobs.ts`:

```typescript
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchJobs } from '../lib/jobs'
import { usePolling } from './usePolling'
import type { Job } from '../types'

const POLL_INTERVAL_MS = 5000

export function useJobs() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return fetchJobs(getToken).then(data => setJobs(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    reload()
      .catch(() => { /* stale list is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, getToken])

  usePolling(() => { reload().catch(() => {}) }, POLL_INTERVAL_MS, isLoaded && isSignedIn)

  return { jobs, loading, reload }
}
```

- [ ] **Step 2: Create the JobsPage component**

Create `src/components/JobsPage.tsx`:

```typescript
import { Link } from 'react-router-dom'
import { useJobs } from '../hooks/useJobs'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'
import type { Job } from '../types'

const STATUS_LABEL_KEY: Record<Job['status'], 'jobStatusQueued' | 'jobStatusRunning' | 'jobStatusDone' | 'jobStatusFailed'> = {
  queued: 'jobStatusQueued',
  running: 'jobStatusRunning',
  done: 'jobStatusDone',
  failed: 'jobStatusFailed',
}

const STATUS_CLASS: Record<Job['status'], string> = {
  queued: 'bg-tint/10 text-cream/50',
  running: 'bg-amber/10 text-amber',
  done: 'bg-herb/10 text-herb',
  failed: 'bg-red-500/10 text-red-400',
}

export default function JobsPage() {
  const { lang } = useLanguage()
        const tx = t[lang]
  const { jobs, loading } = useJobs()

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {tx.jobsPageTitle}
        </h1>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : jobs.length === 0 ? (
          <p className="text-cream/30 text-sm">{tx.noJobsYet}</p>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} className="card p-4">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-sm text-cream/80 truncate">{job.label ?? job.type}</p>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[job.status]}`}>
                    {tx[STATUS_LABEL_KEY[job.status]]}
                  </span>
                </div>
                {job.status === 'done' && job.resultRecipeIds.length > 0 && (
                  <Link
                    to={job.resultRecipeIds.length === 1 ? `/recipes/${job.resultRecipeIds[0]}/edit` : '/my-recipes'}
                    className="text-xs text-amber hover:text-amber/80 transition-colors"
                  >
                    {job.resultRecipeIds.length === 1 ? tx.viewResult : tx.jobDoneBatch(job.resultRecipeIds.length)}
                  </Link>
                )}
                {job.status === 'failed' && job.error && (
                  <p className="text-xs text-red-400/80">{job.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the route**

In `src/App.tsx`, add the import:

```typescript
import JobsPage from './components/JobsPage'
```

Add the route right after the existing `/submissions` route:

```tsx
          <Route path="/jobs" element={<JobsPage />} />
```

- [ ] **Step 4: Add the sidebar nav entry**

In `src/components/Sidebar.tsx`, add a new entry to the `moreLinks` array (after the existing `submissions` entry):

```typescript
    { key: 'jobs', label: tx.jobs, path: '/jobs', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">⏳</span> },
```

- [ ] **Step 5: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 6: Run the react-hooks lint check**

Run:
```bash
cd /Users/tugy/git/recipes
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-report.json
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-report.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
if (hookIssues.length > 0) { console.error('React Hooks rule violations found:'); console.error(JSON.stringify(hookIssues, null, 2)); process.exit(1); }
console.log('No react-hooks violations found.');
"
```
Expected: `No react-hooks violations found.`

- [ ] **Step 7: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/hooks/useJobs.ts src/components/JobsPage.tsx src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: add /jobs page listing import/AI-generate job history"
```

---

## Self-Review Notes

- **Spec coverage:** Job schema + fire-and-forget execution + boot sweep (Task 1), dedupe guard directly addressing the 74-duplicate incident (Tasks 2-3, tested via the "same dedupeKey" tests), single-recipe-always-persists unification (Tasks 2-3), sticky-toast-that-updates-in-place via base-ui's `update()` (Task 4-5), cross-device sync via polling `GET /jobs?status=active` (Task 5), `/jobs` history page (Task 7). Real-time push is explicitly out of scope per the spec and untouched.
- **Type consistency:** `JobsService.create`/`run`/`listMine` signatures (Task 1) match exactly what Tasks 2-3's controllers call. The `Job` frontend type (Task 4) mirrors the backend schema's fields exactly (`resultRecipeIds`, `error`, `status` union). `ToastData.href` (Task 4) is what Task 5's `JobsWatcher` sets and Task 4's `ToastContext.tsx` reads.
- **No placeholders:** every step has literal code, not descriptions.
