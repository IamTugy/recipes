# Admin Analytics & AI Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin visibility into user activity, AI-feature usage per user per month, and general product stats, by logging events into the existing `ActivityLog` collection and pointing a self-hosted Metabase instance at MongoDB (read-only) to build every dashboard through its UI.

**Architecture:** Widen the existing `ActivityLog` schema (`recipeId` becomes optional) and add new action types logged from existing controllers/services via the existing `ActivityLogService.record(...)` method - no new collection, no new write path. A new tiny `search_performed` endpoint covers client-side search (which has no backend endpoint today). Tasks 1-6 are ordinary backend/frontend code with tests. Task 7 (Metabase) is infra + manual dashboard-building through a UI - not scriptable the way the code tasks are, and is called out as a separate, interactive phase.

**Tech Stack:** NestJS + Mongoose (backend, `api/`), React + Vite (frontend, `src/`), Jest for backend tests, Metabase OSS (Docker) for the dashboard layer, k3d + Cloudflare Tunnel for deployment.

## Global Constraints

- No new MongoDB collection - all new events go into the existing `activity_log` collection via `ActivityLogService.record(userId, recipeId, action, metadata?)`.
- `recipeId` on `ActivityLog` becomes optional (`string | undefined`), not removed - existing `recipe_viewed`/`favorited`/`unfavorited` events keep passing a real recipeId.
- AI usage events use the exact action names: `ai_recipe_import_used`, `ai_recipe_generate_used`, `ai_photo_enhance_used`, `ai_quality_review_used`, `ai_nutrition_estimate_used`.
- Every new `activityLog.record(...)` call site gets a unit test asserting the exact action/metadata recorded, following the existing style in `api/src/favorites/favorites.controller.spec.ts`.
- Metabase (Task 7) is deployed via the `new-service` skill per the user's CLAUDE.md, with a read-only MongoDB user - Metabase must never hold write credentials.

---

### Task 1: Widen the `ActivityLog` schema

**Files:**
- Modify: `api/src/activity-log/schemas/activity-log.schema.ts`
- Modify: `api/src/activity-log/activity-log.service.ts`
- Create: `api/src/activity-log/schemas/activity-log.schema.spec.ts`

**Interfaces:**
- Produces: `ActivityLogService.record(userId: string, recipeId: string | undefined, action: string, metadata?: Record<string, unknown>): Promise<void>` - every later task's logging calls use this exact signature, passing `undefined` for `recipeId` when there's no recipe (search, AI recipe generation before a recipe is saved, nutrition estimate).

- [ ] **Step 1: Write the failing schema test**

Create `api/src/activity-log/schemas/activity-log.schema.spec.ts`:

```ts
import { model } from 'mongoose'
import { ActivityLog, ActivityLogSchema } from './activity-log.schema'

describe('ActivityLog schema', () => {
  it('validates without a recipeId - some actions (search, AI generation before a recipe exists) have none', () => {
    const ActivityLogModel = model(`ActivityLog_${Date.now()}`, ActivityLogSchema)
    const doc = new ActivityLogModel({ userId: 'user_1', action: 'search_performed', metadata: { query: 'pasta' } })

    expect(doc.validateSync()).toBeUndefined()
  })

  it('still requires userId and action', () => {
    const ActivityLogModel = model(`ActivityLog_${Date.now()}`, ActivityLogSchema)
    const doc = new ActivityLogModel({})

    const error = doc.validateSync()
    expect(error?.errors.userId).toBeDefined()
    expect(error?.errors.action).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest activity-log/schemas/activity-log.schema.spec.ts`
Expected: FAIL on the first test - `recipeId` is currently `required: true`, so the doc without one fails validation.

- [ ] **Step 3: Widen the schema**

In `api/src/activity-log/schemas/activity-log.schema.ts`, change:

```ts
  @Prop({ required: true, index: true })
  recipeId!: string
```

to:

```ts
  @Prop({ index: true })
  recipeId?: string
```

- [ ] **Step 4: Widen the service signature**

In `api/src/activity-log/activity-log.service.ts`, change the `record` method signature:

```ts
  async record(
    userId: string,
    recipeId: string | undefined,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.activityLogModel.create({ userId, recipeId, action, metadata })
  }
```

(Only the `recipeId` parameter type changes, from `string` to `string | undefined` - the body is unchanged, `mongoose` already omits an `undefined` field on `create`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npx jest activity-log`
Expected: PASS - both new schema tests, plus the existing `activity-log.service.spec.ts` (which only ever passes a real `recipeId`, so it's unaffected by the widened type).

- [ ] **Step 6: Commit**

```bash
cd api
git add src/activity-log/schemas/activity-log.schema.ts src/activity-log/schemas/activity-log.schema.spec.ts src/activity-log/activity-log.service.ts
git commit -m "feat: make ActivityLog.recipeId optional, for events with no associated recipe"
```

---

### Task 2: Log recipe lifecycle events from `RecipesService`

**Files:**
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `ActivityLogService.record(userId, recipeId, action, metadata?)` from Task 1. `this.activityLogService` is already injected into `RecipesService` (constructor arg, used today only for `viewCountsById`).
- Produces: nothing new consumed by later tasks - this task is self-contained.

`RecipesService` already has `private readonly activityLogService: ActivityLogService` injected (see `api/src/recipes/recipes.service.ts:70`). Six call sites get a `record(...)` call added, using the exact action names below.

- [ ] **Step 1: Write the failing tests**

Add to `api/src/recipes/recipes.service.spec.ts`, right after the existing `it('creates a draft owned by the requester', ...)`-style tests around `createDraft` (search for `describe('RecipesService'`, then the block testing `createDraft`):

```ts
  it('createDraft logs a recipe_created event', async () => {
    const exists = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(false) })
    const create = jest.fn().mockResolvedValue({ id: 'new-recipe', title: 'Tomato Soup' })
    const activityLog = makeActivityLog()
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) }, undefined, activityLog)
    await service.createDraft('user_1', { title: 'Tomato Soup' } as any)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'new-recipe', 'recipe_created')
  })
```

Add after the existing `updateDraft` tests:

```ts
  it('updateDraft logs a recipe_updated event', async () => {
    const existing = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { id: 'tomato-soup', slug: 'tomato-soup', currentRevision: 2 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) }, undefined, activityLog)
    await service.updateDraft('tomato-soup', 'user_1', false, minimalDto as any)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'tomato-soup', 'recipe_updated')
  })
```

Add after the existing `submitForReview` tests (search for where the publish-threshold tests live, around `PUBLISH_THRESHOLD`):

```ts
  it('submitForReview logs submitted, AI-quality-review-used, and published events on a passing score', async () => {
    const recipe = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, { updateOne }, undefined, activityLog, undefined, undefined, undefined, quality)
    await service.submitForReview('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_submitted_for_review')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'ai_quality_review_used')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_published')
  })

  it('submitForReview logs a recipe_rejected event with the score on a failing score', async () => {
    const recipe = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const quality = makeQualityService({ score: 40, checkedAt: 'now', findings: [{ category: 'x', severity: 'critical', message: 'bad' }] })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, undefined, undefined, activityLog, undefined, undefined, undefined, quality)
    await service.submitForReview('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_rejected', { score: 40 })
  })
```

(These reuse the existing `completeRecipe()` helper and `makeQualityService()` helper already defined lower in the spec file - if `completeRecipe` is defined after where you're adding these tests, that's fine, Jest hoists `function` declarations.)

Add after the existing `remove` tests (search for `describe`/`it` blocks testing `service.remove`):

```ts
  it('remove logs a recipe_deleted event with a title/ownerId snapshot before soft-deleting', async () => {
    const recipe = { id: 'a', title: 'Tomato Soup', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, undefined, undefined, activityLog)
    await service.remove('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_deleted', { title: 'Tomato Soup', ownerId: 'user_1' })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: FAIL - the 5 new tests fail because `activityLog.record` is never called by `createDraft`/`updateDraft`/`submitForReview`/`remove` yet.

- [ ] **Step 3: Wire the logging calls**

In `api/src/recipes/recipes.service.ts`, modify `createDraft` (around line 305):

```ts
  async createDraft(userId: string, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const slug = await this.generateUniqueSlug(dto.title)
    const recipe = await this.recipeModel.create({
      ...dto, sources: dedupeSources(dto.sources), slug, ownerId: userId, status: 'draft', currentRevision: 1,
    })
    await this.saveNewRevision(recipe, userId)
    await this.activityLogService.record(userId, recipe.id, 'recipe_created')
    return recipe
  }
```

Modify `updateDraft` (around line 338):

```ts
  async updateDraft(id: string, userId: string, isAdmin: boolean, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    const wasRejected = recipe.status === 'rejected'
    const aiLock = recipe.aiGenerated ? { aiGenerated: true, sources: recipe.sources } : {}
    const update: Record<string, unknown> = {
      $set: { ...dto, sources: dedupeSources(dto.sources), ...aiLock, ...(wasRejected ? { status: 'draft' } : {}) },
      $inc: { currentRevision: 1 },
    }
    if (wasRejected) update.$unset = { reviewComment: '' }
    const updated = await this.recipeModel.findOneAndUpdate({ _id: id }, update, { new: true }).exec()
    if (!updated) throw new NotFoundException(`Recipe '${id}' not found`)
    await this.saveNewRevision(updated, userId)
    await this.activityLogService.record(userId, updated.id, 'recipe_updated')
    return updated
  }
```

Modify `submitForReview` (around line 362):

```ts
  async submitForReview(id: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    const missing = this.missingRequiredFields(recipe)
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot submit for review, missing/invalid: ${missing.join(', ')}`)
    }

    await this.activityLogService.record(userId, id, 'recipe_submitted_for_review')
    const review = await this.qualityService.review(recipe.toObject())
    await this.activityLogService.record(userId, id, 'ai_quality_review_used')

    if (review.score >= RecipesService.PUBLISH_THRESHOLD) {
      await this.revisionModel.updateOne(
        { recipeId: id, revisionNumber: recipe.currentRevision },
        { $set: { published: true } },
      )
      recipe.publishedRevision = recipe.currentRevision
      recipe.status = 'published'
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_published')
    } else {
      recipe.status = 'rejected'
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_rejected', { score: review.score })
    }
    return recipe
  }
```

(Note: the `recipe.qualityReview = review` and `await recipe.save()` lines moved into both branches, since the log call for each branch needs to happen after that branch's own state is set - this preserves the exact same end state as before, just restructured so each branch's `record()` call is scoped to it.)

Modify `remove` (around line 471):

```ts
  async remove(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const recipe = await this.recipeModel.findOne({ _id: id }).exec()
    if (!recipe) return
    if (recipe.publishedRevision != null) {
      throw new ForbiddenException('A recipe that has ever been published can never be deleted')
    }
    if (recipe.status === 'pending_review') {
      throw new BadRequestException('This recipe is locked while its publish request is pending review')
    }
    if (recipe.ownerId && recipe.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the owner or an admin can delete this recipe')
    }
    recipe.deletedAt = new Date()
    await recipe.save()
    await this.activityLogService.record(userId, id, 'recipe_deleted', { title: recipe.title, ownerId: recipe.ownerId })
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: PASS - all tests including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
cd api
git add src/recipes/recipes.service.ts src/recipes/recipes.service.spec.ts
git commit -m "feat: log recipe lifecycle and AI-quality-review events from RecipesService"
```

---

### Task 3: Log `rating_given` from `RatingsController`

**Files:**
- Modify: `api/src/ratings/ratings.module.ts`
- Modify: `api/src/ratings/ratings.controller.ts`
- Modify: `api/src/ratings/ratings.controller.spec.ts`

**Interfaces:**
- Consumes: `ActivityLogService.record(userId, recipeId, action, metadata?)` from Task 1.

- [ ] **Step 1: Write the failing tests**

In `api/src/ratings/ratings.controller.spec.ts`, add `activityLog` to the top-level test doubles and thread it through `makeController`:

```ts
import { RatingsController } from './ratings.controller'

describe('RatingsController', () => {
  const ratingsService = { rate: jest.fn(), reviewsForRecipe: jest.fn(), distributionForRecipe: jest.fn(), myRating: jest.fn(), deleteRating: jest.fn(), toggleUpvote: jest.fn() }
  const reviewRepliesService = { countsByRatingIds: jest.fn(), listByRating: jest.fn(), create: jest.fn(), toggleUpvote: jest.fn() }
  const usersService = { namesByIds: jest.fn() }
  const activityLog = { record: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    reviewRepliesService.countsByRatingIds.mockResolvedValue({})
    usersService.namesByIds.mockResolvedValue({})
  })

  function makeController() {
    return new RatingsController(ratingsService as any, reviewRepliesService as any, usersService as any, activityLog as any)
  }
```

Update the 3 existing `rate` tests to pass `req` as the 3rd argument (it's already passed as the 3rd positional arg per the current controller signature `rate(id, body, req)` - no change needed there), then add one new test right after them:

```ts
  it('PUT /ratings/:slug logs a rating_given event with the score', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = makeController()
    await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'rating_given', { score: 5 })
  })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd api && npx jest ratings/ratings.controller.spec.ts`
Expected: FAIL - `RatingsController` constructor doesn't accept a 4th argument yet, and `rate` doesn't call `activityLog.record`.

- [ ] **Step 3: Wire the injection and the call**

In `api/src/ratings/ratings.module.ts`, add the import and module:

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rating, RatingSchema } from './schemas/rating.schema'
import { ReviewReply, ReviewReplySchema } from './schemas/review-reply.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { RatingsService } from './ratings.service'
import { ReviewRepliesService } from './review-replies.service'
import { RatingsController } from './ratings.controller'
import { UsersModule } from '../users/users.module'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rating.name, schema: RatingSchema },
      { name: ReviewReply.name, schema: ReviewReplySchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    UsersModule,
    ActivityLogModule,
  ],
  providers: [RatingsService, ReviewRepliesService],
  controllers: [RatingsController],
})
export class RatingsModule {}
```

In `api/src/ratings/ratings.controller.ts`, add the import, constructor arg, and call:

```ts
import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RatingsService } from './ratings.service'
import { ReviewRepliesService } from './review-replies.service'
import { UsersService } from '../users/users.service'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { RateRecipeDto } from './dto/rate-recipe.dto'
import { ReplyToReviewDto } from './dto/reply-to-review.dto'

@Controller('ratings')
export class RatingsController {
  constructor(
    private readonly ratingsService: RatingsService,
    private readonly reviewRepliesService: ReviewRepliesService,
    private readonly usersService: UsersService,
    private readonly activityLog: ActivityLogService,
  ) {}
```

...and in the `rate` method:

```ts
  @Put(':id')
  async rate(
    @Param('id') id: string,
    @Body() body: RateRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    const result = await this.ratingsService.rate(req.userId, id, body.score, body.comment, body.photoUrl)
    await this.activityLog.record(req.userId, id, 'rating_given', { score: body.score })
    return result
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest ratings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd api
git add src/ratings/ratings.module.ts src/ratings/ratings.controller.ts src/ratings/ratings.controller.spec.ts
git commit -m "feat: log rating_given events from RatingsController"
```

---

### Task 4: Log AI usage from the import/AI-generate/nutrition controllers

**Files:**
- Modify: `api/src/recipes/import/recipe-import.controller.ts`
- Modify: `api/src/recipes/import/recipe-import.controller.spec.ts`
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.controller.ts`
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`
- Modify: `api/src/recipes/nutrition/nutrition.controller.ts`
- Modify: `api/src/recipes/nutrition/nutrition.controller.spec.ts`

**Interfaces:**
- Consumes: `ActivityLogService.record(userId, recipeId, action, metadata?)` from Task 1. All three controllers are declared in `RecipesModule` (`api/src/recipes/recipes.module.ts`), which already imports `ActivityLogModule` - no module changes needed for this task.

None of these three recipes have been saved yet at the point these endpoints run (import/generate produce a draft the client hasn't saved; nutrition estimate takes raw ingredients, not a recipe id) - every `record()` call here passes `undefined` for `recipeId`.

- [ ] **Step 1: Write the failing tests**

`api/src/recipes/import/recipe-import.controller.spec.ts` - update the constructor call and add one test:

```ts
import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'

describe('RecipeImportController', () => {
  const importService = {
    importFromText: jest.fn(),
    importFromUrl: jest.fn(),
    importFromFile: jest.fn(),
  }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeImportController(importService as unknown as RecipeImportService, activityLog as any)

  beforeEach(() => jest.clearAllMocks())

  it('imports from text when only text is provided', async () => {
    importService.importFromText.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)
    expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from url when only url is provided', async () => {
    importService.importFromUrl.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ url: 'https://example.com/soup' }, { userId: 'user_1' } as any, undefined)
    expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from file when only a file is provided', async () => {
    importService.importFromFile.mockResolvedValue({ title: 'Soup' })
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    const result = await controller.import({}, { userId: 'user_1' } as any, file)
    expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('throws BadRequestException when no source is provided', async () => {
    await expect(controller.import({}, { userId: 'user_1' } as any, undefined)).rejects.toThrow(BadRequestException)
  })

  it('logs an ai_recipe_import_used event after a successful import', async () => {
    importService.importFromText.mockResolvedValue({ title: 'Soup' })
    await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_import_used')
  })
})
```

(If the existing file has more tests below the ones shown - e.g. a "throws when more than one source is provided" test - keep them, just add the `{ userId: 'user_1' }` argument to their `controller.import(...)` calls too, in the same position.)

`api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeAiGenerateController(aiGenerateService as unknown as RecipeAiGenerateService, activityLog as any)

  beforeEach(() => jest.clearAllMocks())

  it('generates a recipe from a query', async () => {
    aiGenerateService.generate.mockResolvedValue({ title: 'Soup', aiGenerated: true, sources: [] })
    const result = await controller.generate({ query: '  best tomato soup  ' }, { userId: 'user_1' } as any)
    expect(aiGenerateService.generate).toHaveBeenCalledWith('best tomato soup')
    expect(result).toEqual({ title: 'Soup', aiGenerated: true, sources: [] })
  })

  it('throws BadRequestException when no query is provided', async () => {
    await expect(controller.generate({}, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when the query is blank', async () => {
    await expect(controller.generate({ query: '   ' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('logs an ai_recipe_generate_used event after a successful generation', async () => {
    aiGenerateService.generate.mockResolvedValue({ title: 'Soup' })
    await controller.generate({ query: 'tomato soup' }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used')
  })
})
```

`api/src/recipes/nutrition/nutrition.controller.spec.ts`:

```ts
import { NutritionController } from './nutrition.controller'
import { NutritionService } from './nutrition.service'

describe('NutritionController', () => {
  const nutritionService = { estimate: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new NutritionController(nutritionService as unknown as NutritionService, activityLog as any)

  beforeEach(() => jest.clearAllMocks())

  it('delegates to the nutrition service', async () => {
    const body = { ingredients: [{ group: '', items: [{ amount: 1, unit: 'cup', name: 'rice' }] }], servings: 2 }
    nutritionService.estimate.mockResolvedValue({ calories: 200 })

    const result = await controller.estimate(body, { userId: 'user_1' } as any)

    expect(nutritionService.estimate).toHaveBeenCalledWith(body)
    expect(result).toEqual({ calories: 200 })
  })

  it('logs an ai_nutrition_estimate_used event', async () => {
    const body = { ingredients: [{ group: '', items: [{ amount: 1, unit: 'cup', name: 'rice' }] }] }
    nutritionService.estimate.mockResolvedValue({ calories: 200 })

    await controller.estimate(body, { userId: 'user_1' } as any)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_nutrition_estimate_used')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipes/import/recipe-import.controller.spec.ts recipes/ai-generate/recipe-ai-generate.controller.spec.ts recipes/nutrition/nutrition.controller.spec.ts`
Expected: FAIL - constructors don't accept the new argument, methods don't accept `req`, no `record()` calls exist yet.

- [ ] **Step 3: Wire the injection and the calls**

`api/src/recipes/import/recipe-import.controller.ts`:

```ts
import { Body, Controller, Post, BadRequestException, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { RecipeImportService } from './recipe-import.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'

@Controller('recipes/import')
export class RecipeImportController {
  constructor(
    private readonly importService: RecipeImportService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @Body() body: { text?: string; url?: string },
    @Req() req: Request & { userId: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const sourcesProvided = [body.text, body.url, file].filter(Boolean).length
    if (sourcesProvided === 0) {
      throw new BadRequestException('Provide text, a URL, or a file')
    }
    if (sourcesProvided > 1) {
      throw new BadRequestException('Provide only one of text, a URL, or a file')
    }

    const result = body.text
      ? await this.importService.importFromText(body.text)
      : body.url
        ? await this.importService.importFromUrl(body.url)
        : await this.importService.importFromFile(file!.buffer, file!.mimetype)

    await this.activityLog.record(req.userId, undefined, 'ai_recipe_import_used')
    return result
  }
}
```

`api/src/recipes/ai-generate/recipe-ai-generate.controller.ts`:

```ts
import { Body, Controller, Post, BadRequestException, Req } from '@nestjs/common'
import { Request } from 'express'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
  constructor(
    private readonly aiGenerateService: RecipeAiGenerateService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  async generate(@Body() body: { query?: string }, @Req() req: Request & { userId: string }) {
    if (!body.query?.trim()) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    const result = await this.aiGenerateService.generate(body.query.trim())
    await this.activityLog.record(req.userId, undefined, 'ai_recipe_generate_used')
    return result
  }
}
```

`api/src/recipes/nutrition/nutrition.controller.ts`:

```ts
import { Body, Controller, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { NutritionService } from './nutrition.service'
import { NutritionEstimateRequestDto } from './nutrition-estimate.dto'
import { ActivityLogService } from '../../activity-log/activity-log.service'

@Controller('recipes/nutrition')
export class NutritionController {
  constructor(
    private readonly nutritionService: NutritionService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post('estimate')
  async estimate(@Body() body: NutritionEstimateRequestDto, @Req() req: Request & { userId: string }) {
    const result = await this.nutritionService.estimate(body)
    await this.activityLog.record(req.userId, undefined, 'ai_nutrition_estimate_used')
    return result
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipes/import/recipe-import.controller.spec.ts recipes/ai-generate/recipe-ai-generate.controller.spec.ts recipes/nutrition/nutrition.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd api
git add src/recipes/import/recipe-import.controller.ts src/recipes/import/recipe-import.controller.spec.ts \
        src/recipes/ai-generate/recipe-ai-generate.controller.ts src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts \
        src/recipes/nutrition/nutrition.controller.ts src/recipes/nutrition/nutrition.controller.spec.ts
git commit -m "feat: log AI usage events for recipe import, AI generate, and nutrition estimate"
```

---

### Task 5: Log `ai_photo_enhance_used` from `UploadsController`

**Files:**
- Modify: `api/src/uploads/uploads.module.ts`
- Modify: `api/src/uploads/uploads.controller.ts`
- Modify: `api/src/uploads/uploads.controller.spec.ts`

**Interfaces:**
- Consumes: `ActivityLogService.record(userId, recipeId, action, metadata?)` from Task 1.

Only `enhance-photo` is an AI feature - `presign` just issues a signed upload URL and stays untouched (its tests are unaffected other than the constructor call needing the new argument).

- [ ] **Step 1: Write the failing tests**

Replace `api/src/uploads/uploads.controller.spec.ts` in full:

```ts
import { UploadsController } from './uploads.controller'

describe('UploadsController', () => {
  const activityLog = { record: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('POST /uploads/presign returns a presigned upload URL and the resulting public URL', async () => {
    const uploadsService = {
      presignPhotoUpload: jest.fn().mockResolvedValue({
        uploadUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
      }),
    }
    const controller = new UploadsController(uploadsService as any, activityLog as any)

    const result = await controller.presign({ recipeId: 'a', contentType: 'image/jpeg' })

    expect(uploadsService.presignPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg', undefined)
    expect(result).toEqual({
      uploadUrl: 'https://r2.example.com/signed',
      publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
    })
  })

  it('passes the purpose through when provided', async () => {
    const uploadsService = { presignPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: 'u', publicUrl: 'p' }) }
    const controller = new UploadsController(uploadsService as any, activityLog as any)

    await controller.presign({ recipeId: 'a', contentType: 'image/jpeg', purpose: 'recipe' })

    expect(uploadsService.presignPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg', 'recipe')
  })

  it('POST /uploads/enhance-photo delegates to the service and returns the new public URL', async () => {
    const uploadsService = {
      enhancePhoto: jest.fn().mockResolvedValue({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' }),
    }
    const controller = new UploadsController(uploadsService as any, activityLog as any)

    const result = await controller.enhancePhoto(
      { recipeId: 'a', imageUrl: 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg' },
      { userId: 'user_1' } as any,
    )

    expect(uploadsService.enhancePhoto).toHaveBeenCalledWith('a', 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg', undefined)
    expect(result).toEqual({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' })
  })

  it('POST /uploads/enhance-photo passes custom instructions through to the service', async () => {
    const uploadsService = {
      enhancePhoto: jest.fn().mockResolvedValue({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' }),
    }
    const controller = new UploadsController(uploadsService as any, activityLog as any)

    await controller.enhancePhoto(
      {
        recipeId: 'a',
        imageUrl: 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg',
        instructions: 'Show it outdoors in natural sunlight',
      },
      { userId: 'user_1' } as any,
    )

    expect(uploadsService.enhancePhoto).toHaveBeenCalledWith(
      'a', 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg', 'Show it outdoors in natural sunlight',
    )
  })

  it('POST /uploads/enhance-photo logs an ai_photo_enhance_used event', async () => {
    const uploadsService = {
      enhancePhoto: jest.fn().mockResolvedValue({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' }),
    }
    const controller = new UploadsController(uploadsService as any, activityLog as any)

    await controller.enhancePhoto(
      { recipeId: 'a', imageUrl: 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg' },
      { userId: 'user_1' } as any,
    )

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'ai_photo_enhance_used')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest uploads/uploads.controller.spec.ts`
Expected: FAIL - constructor/method signatures don't match yet.

- [ ] **Step 3: Wire the injection and the call**

In `api/src/uploads/uploads.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { UploadsService } from './uploads.service'
import { UploadsController } from './uploads.controller'

@Module({
  imports: [AiModule, ActivityLogModule],
  providers: [UploadsService],
  controllers: [UploadsController],
})
export class UploadsModule {}
```

In `api/src/uploads/uploads.controller.ts`:

```ts
import { Body, Controller, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { UploadsService } from './uploads.service'
import { PresignUploadDto } from './dto/presign-upload.dto'
import { EnhancePhotoDto } from './dto/enhance-photo.dto'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post('presign')
  async presign(@Body() body: PresignUploadDto) {
    return this.uploadsService.presignPhotoUpload(body.recipeId, body.contentType, body.purpose)
  }

  @Post('enhance-photo')
  async enhancePhoto(@Body() body: EnhancePhotoDto, @Req() req: Request & { userId: string }) {
    const result = await this.uploadsService.enhancePhoto(body.recipeId, body.imageUrl, body.instructions)
    await this.activityLog.record(req.userId, body.recipeId, 'ai_photo_enhance_used')
    return result
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest uploads/uploads.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd api
git add src/uploads/uploads.module.ts src/uploads/uploads.controller.ts src/uploads/uploads.controller.spec.ts
git commit -m "feat: log ai_photo_enhance_used events from UploadsController"
```

---

### Task 6: `search_performed` logging - backend endpoint + frontend wiring

**Files:**
- Create: `api/src/activity-log/dto/search-performed.dto.ts`
- Create: `api/src/activity-log/activity-log.controller.ts`
- Create: `api/src/activity-log/activity-log.controller.spec.ts`
- Modify: `api/src/activity-log/activity-log.module.ts`
- Create: `src/lib/logSearch.ts`
- Modify: `src/components/Home.tsx`

**Interfaces:**
- Consumes: `ActivityLogService.record(userId, recipeId, action, metadata?)` from Task 1.
- Produces: `POST /api/activity/search` accepting `{ query: string; resultsCount: number }`, auth-gated by the existing global `ClerkAuthGuard` (same as every other endpoint) - no new auth concept.

- [ ] **Step 1: Write the failing backend test**

Create `api/src/activity-log/dto/search-performed.dto.ts`:

```ts
import { IsInt, IsString, Min, MinLength } from 'class-validator'

export class SearchPerformedDto {
  @IsString()
  @MinLength(1)
  query!: string

  @IsInt()
  @Min(0)
  resultsCount!: number
}
```

Create `api/src/activity-log/activity-log.controller.spec.ts`:

```ts
import { ActivityLogController } from './activity-log.controller'

describe('ActivityLogController', () => {
  const activityLogService = { record: jest.fn() }
  const controller = new ActivityLogController(activityLogService as any)

  beforeEach(() => jest.clearAllMocks())

  it('POST /activity/search logs a search_performed event with the query and result count', async () => {
    const result = await controller.logSearch({ query: 'pasta', resultsCount: 12 }, { userId: 'user_1' } as any)

    expect(activityLogService.record).toHaveBeenCalledWith('user_1', undefined, 'search_performed', { query: 'pasta', resultsCount: 12 })
    expect(result).toEqual({ logged: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest activity-log/activity-log.controller.spec.ts`
Expected: FAIL - `activity-log.controller.ts` doesn't exist yet.

- [ ] **Step 3: Create the controller and wire it into the module**

Create `api/src/activity-log/activity-log.controller.ts`:

```ts
import { Body, Controller, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { ActivityLogService } from './activity-log.service'
import { SearchPerformedDto } from './dto/search-performed.dto'

@Controller('activity')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Post('search')
  async logSearch(@Body() body: SearchPerformedDto, @Req() req: Request & { userId: string }) {
    await this.activityLogService.record(req.userId, undefined, 'search_performed', {
      query: body.query,
      resultsCount: body.resultsCount,
    })
    return { logged: true }
  }
}
```

Modify `api/src/activity-log/activity-log.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema'
import { ActivityLogService } from './activity-log.service'
import { ActivityLogController } from './activity-log.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }])],
  providers: [ActivityLogService],
  controllers: [ActivityLogController],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx jest activity-log`
Expected: PASS - all `activity-log` tests, including the new controller test.

- [ ] **Step 5: Wire the frontend search log call**

Create `src/lib/logSearch.ts`:

```ts
// Best-effort analytics call - search is entirely client-side (Home.tsx
// filters an already-fetched recipe list), so this is the only place a
// "search was performed" event reaches the backend. Failures are silently
// ignored; a missed log entry should never affect the search UX itself.
export async function logSearch(
  query: string,
  resultsCount: number,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch('/api/activity/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, resultsCount }),
    })
  } catch {
    /* best-effort - ignore */
  }
}
```

In `src/components/Home.tsx`:

1. Add the import at the top, alongside the other imports:

```ts
import { useAuth } from '@clerk/react'
import { logSearch } from '../lib/logSearch'
```

2. Inside the `Home()` component, add `const { getToken } = useAuth()` near the top (alongside the existing `const navigate = useNavigate()` line).

3. Right after the `filtered` `useMemo` block (search for `}, [search, activeCategory, activeDifficulty, activeDietary, activeKosher, lang, recipes, showFavoritesOnly, favoriteSlugs, sortBy])` - that's the end of the `filtered` memo), add:

```ts
  // Debounced search-event log: fires 1s after the user stops typing a
  // non-empty query, reading the *current* result count via a ref so
  // unrelated filter changes (category, sort, etc.) don't reset the debounce
  // timer or cause extra log calls - only changes to the search text do.
  const filteredCountRef = useRef(filtered.length)
  filteredCountRef.current = filtered.length

  useEffect(() => {
    const trimmed = search.trim()
    if (!trimmed) return
    const timer = setTimeout(() => {
      logSearch(trimmed, filteredCountRef.current, getToken)
    }, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
```

- [ ] **Step 6: Verify the frontend builds and lints clean**

Run: `npm run build`
Expected: PASS, no TypeScript errors.

Run: `npx eslint 'src/**/*.{ts,tsx}' --format json`
Expected: no messages for `src/components/Home.tsx` or `src/lib/logSearch.ts`.

(No frontend unit test framework exists in this repo - this is verified via build/lint plus a manual check that a POST to `/api/activity/search` appears in the network tab 1s after typing a search query, per this project's established convention.)

- [ ] **Step 7: Commit**

```bash
cd api
git add src/activity-log/dto/search-performed.dto.ts src/activity-log/activity-log.controller.ts \
        src/activity-log/activity-log.controller.spec.ts src/activity-log/activity-log.module.ts
git commit -m "feat: add POST /activity/search endpoint for search_performed events"
cd ..
git add src/lib/logSearch.ts src/components/Home.tsx
git commit -m "feat: log search_performed events from Home.tsx, debounced on the search box"
```

---

### Task 7: Deploy Metabase and build the admin dashboards (manual/infra - not scriptable end-to-end)

**This task is fundamentally different from Tasks 1-6.** It's standing up a real service and clicking through a UI to build dashboards - there's no test to write first, and a coding agent can script the deployment but not meaningfully "test" a dashboard the way a unit test verifies code. Treat this as a checklist to work through with the user watching, not an unattended TDD loop.

**Files:**
- New k3d/Cloudflare Tunnel service config, following whatever file layout the `new-service` skill produces (check `~/server.md` and the `new-service` skill itself for the exact pattern used in this cluster - referenced in `/Users/tugy/CLAUDE.md`).

- [ ] **Step 1: Create a read-only MongoDB user for Metabase**

Connect to the `mongo-0` pod (read-only `kubectl exec` queries have worked reliably in this environment per prior sessions) and create a user scoped to the recipes database with only the `read` role - never `readWrite`:

```js
use recipes  // or whatever the actual database name is - confirm via `show dbs` first
db.createUser({
  user: "metabase_readonly",
  pwd: "<generate a strong password, store it in the same secrets mechanism the cluster already uses>",
  roles: [{ role: "read", db: "recipes" }]
})
```

Verify the user genuinely can't write:

```js
db.auth("metabase_readonly", "<password>")
db.activity_log.insertOne({ test: true })  // must fail with an authorization error
```

- [ ] **Step 2: Deploy Metabase via the `new-service` skill**

Invoke the `new-service` skill (per `/Users/tugy/CLAUDE.md`: "To deploy a new service, use the `new-service` skill") to stand up the `metabase/metabase` Docker image as a new service in the k3d cluster, exposed through the existing Cloudflare Tunnel on its own subdomain. Follow whatever conventions that skill and `~/server.md` establish for secrets, resource limits, and tunnel config - this plan doesn't prescribe those, since they're the skill's job.

- [ ] **Step 3: Complete Metabase's first-run setup**

Open the new subdomain in a browser, create the Metabase admin account (this is Metabase's own login, separate from Clerk - only the site owner uses this tool), and connect it to MongoDB using the `metabase_readonly` credentials from Step 1.

- [ ] **Step 4: Build the three dashboards**

Through Metabase's UI (no code):

1. **Event log browser** - a table question over `activity_log`, with filters exposed for `action`, `userId`, and a date range.
2. **AI usage per user per month** - a pivot/summarize question over `activity_log` filtered to `action` starting with `ai_` (or one of the 5 exact action names), grouped by `userId` and `timestamp` bucketed by month.
3. **Stats dashboard** - a dashboard combining: recipe count over time (group `recipes` by `createdAt`/month), status breakdown (group by `status`), ratings count/average (from the `ratings` collection), user distribution (group `recipes` by `ownerId`), published-vs-total ratio.

- [ ] **Step 5: Confirm with the user**

Once the 3 dashboards are live, ask the user to check them against real data and confirm they show what's expected before considering this task done - this is the "test" for infra/config work, since there's no automated equivalent.
