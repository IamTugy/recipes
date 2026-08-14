# Cook Mode Redesign — Phase E: Cook-Counter + Dock Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically count a recipe as cooked when a guided cook session genuinely finishes, cooldown-gated per user; expose both total and per-user counts; delete the dead manual "mark cooked" toggle; apply four small UI polish items to the "Start cooking" button and cook dock.

**Architecture:** Rebuild `api/src/cook-log/` from a boolean unique-index marker into an append-only, timestamped event log. `CookSessionsService.finishSession` calls a new `CookLogService.recordCook` at the point a cook genuinely completes — the sole trigger, no new integration surface. `CookLogService` gains a `Recipe` model dependency to read `prepTime`/`cookTime` for the cooldown window. `recipes.service.ts` threads a new per-user count through the one detail-page call site that has a viewer identity. Frontend: four independent JSX/prop changes to `RecipeDetail.tsx`'s button and `CookDock.tsx`'s expanded header.

**Tech Stack:** NestJS, Mongoose, React/Vite. No new dependencies.

## Global Constraints

- `CookLog` schema drops its unique `(userId, recipeId)` index and gains `cookedAt: Date` — one row per counted cook event, not a boolean marker.
- Cooldown: `Math.max((recipe.prepTime ?? 0) + (recipe.cookTime ?? 0), 10)` minutes, checked against the calling user's own most recent `CookLog` row for that recipe — scoped per-user, not global.
- `recordCook` never throws — `finishSession` must always succeed and always write its `CookSession` Mongo document regardless of whether `recordCook` inserts or silently no-ops (cooldown) or hits an internal error.
- `countsById(recipeIds)` keeps its exact existing name/signature/return type (`Promise<Map<string, number>>`) — every current call site in `recipes.service.ts` keeps working unchanged, now counting events instead of distinct users.
- New `userCountsById(userId, recipeIds)` — same shape, scoped to one user — is wired ONLY into `findByIdForUser`'s published-recipe branch (the single recipe-detail route that has both a signed-in viewer identity and a `cooks` map already in scope). List/card endpoints (`findAll`, `findPublishedByOwner`, `findById`) do NOT gain this field.
- Delete outright (confirmed dead, zero live callers anywhere): `api/src/cook-log/cook-log.controller.ts`, `src/hooks/useCookedRecipes.ts`. `CookLogService.markCooked`/`unmarkCooked`/`listIds` are removed since nothing calls them once the controller is gone.
- Per this codebase's `CLAUDE.md` activity-logging convention: `recordCook`'s successful insert (not the cooldown no-op) fires `ActivityLogService.record(userId, recipeId, 'recipe_cooked')` — this replaces the old controller's now-deleted manual `recipe_cooked` log call as the trigger for that event name, so the activity feed doesn't lose it.
- "Start cooking" button: no `(N)` badge inside it anymore; `w-full` below the `sm:` breakpoint, natural width at `sm:` and up.
- Clicking "Start cooking" opens the dock already expanded (90dvh), not collapsed. Cross-device resume/polling (Phase D) must NOT be affected — this only changes the initial state at the moment of a fresh user click.
- Expanded dock header: collapse chevron moves to its own centered strip above the header row (drag-handle style); the header row's left slot becomes the step label; the right slot becomes a labeled "Stop cooking" text button (new i18n key `stopCooking`, he: "הפסק בישול", en: "Stop cooking") replacing the icon-only ✕.
- No new npm dependencies in either `api/` or the root frontend package.

---

## Task 1: Backend — cooldown-gated cook-counter, delete dead manual-toggle controller

**Files:**
- Modify (full rewrite): `api/src/cook-log/schemas/cook-log.schema.ts`
- Modify (full rewrite): `api/src/cook-log/cook-log.service.ts`
- Modify (full rewrite): `api/src/cook-log/cook-log.service.spec.ts`
- Modify (full rewrite): `api/src/cook-log/cook-log.module.ts`
- Delete: `api/src/cook-log/cook-log.controller.ts`
- Delete: `api/src/cook-log/cook-log.controller.spec.ts` (if it exists)
- Modify: `api/src/cook-sessions/cook-sessions.service.ts`
- Modify: `api/src/cook-sessions/cook-sessions.service.spec.ts`
- Modify: `api/src/cook-sessions/cook-sessions.module.ts`
- Modify: `api/src/recipes/recipes.service.ts`

**Interfaces:**
- Produces: `CookLogService.recordCook(userId: string, recipeId: string): Promise<void>` (never throws), `CookLogService.countsById(recipeIds: string[]): Promise<Map<string, number>>` (unchanged signature, new semantics), `CookLogService.userCountsById(userId: string, recipeIds: string[]): Promise<Map<string, number>>` (new).
- Consumes: `RecipeSchema`/`RecipeDocument` (new — `CookLogModule` gains a `Recipe` model dependency for `prepTime`/`cookTime` lookup), `ActivityLogService.record` (already imported in `CookLogModule` today).

- [ ] **Step 1: Check for a controller spec file and remove the two dead files**

```bash
ls api/src/cook-log/cook-log.controller.spec.ts 2>/dev/null && rm api/src/cook-log/cook-log.controller.spec.ts
rm api/src/cook-log/cook-log.controller.ts
rm src/hooks/useCookedRecipes.ts
```

- [ ] **Step 2: Replace `api/src/cook-log/schemas/cook-log.schema.ts` with:**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CookLogDocument = CookLog & Document

@Schema({ timestamps: true })
export class CookLog {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true })
  cookedAt!: Date
}

export const CookLogSchema = SchemaFactory.createForClass(CookLog)
CookLogSchema.index({ userId: 1, recipeId: 1, cookedAt: -1 })
```

- [ ] **Step 3: Write the failing service tests**

Replace `api/src/cook-log/cook-log.service.spec.ts` with:

```ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookLogService } from './cook-log.service'
import { CookLog } from './schemas/cook-log.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'

describe('CookLogService', () => {
  const findOne = jest.fn()
  const create = jest.fn()
  const find = jest.fn()
  const aggregate = jest.fn()
  const cookLogModel = { findOne, create, find, aggregate }

  const recipeFindOne = jest.fn()
  const recipeModel = { findOne: recipeFindOne }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookLogService,
        { provide: getModelToken(CookLog.name), useValue: cookLogModel },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
      ],
    }).compile()
    return moduleRef.get(CookLogService)
  }

  it('recordCook inserts a new row on the very first cook of a recipe', async () => {
    findOne.mockReturnValue({ sort: () => ({ exec: jest.fn().mockResolvedValue(null) }) })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
    create.mockResolvedValue({})
    const service = await makeService()
    await service.recordCook('user_1', 'recipe_a')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', recipeId: 'recipe_a' }))
  })

  it('recordCook silently no-ops when the last cook was inside the cooldown window', async () => {
    const now = new Date('2026-08-14T10:30:00.000Z')
    const realDateNow = Date.now
    Date.now = () => now.getTime()
    try {
      findOne.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue({ cookedAt: new Date('2026-08-14T10:20:00.000Z') }) }),
      })
      recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
      const service = await makeService()
      await service.recordCook('user_1', 'recipe_a')
      expect(create).not.toHaveBeenCalled()
    } finally {
      Date.now = realDateNow
    }
  })

  it('recordCook inserts a new row when the last cook was outside the cooldown window', async () => {
    const now = new Date('2026-08-14T11:00:00.000Z')
    const realDateNow = Date.now
    Date.now = () => now.getTime()
    try {
      findOne.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue({ cookedAt: new Date('2026-08-14T10:20:00.000Z') }) }),
      })
      recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
      create.mockResolvedValue({})
      const service = await makeService()
      await service.recordCook('user_1', 'recipe_a')
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', recipeId: 'recipe_a' }))
    } finally {
      Date.now = realDateNow
    }
  })

  it('recordCook applies the 10-minute cooldown floor when the recipe has no prepTime/cookTime set', async () => {
    const now = new Date('2026-08-14T10:05:00.000Z')
    const realDateNow = Date.now
    Date.now = () => now.getTime()
    try {
      findOne.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue({ cookedAt: new Date('2026-08-14T10:00:00.000Z') }) }),
      })
      recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
      const service = await makeService()
      await service.recordCook('user_1', 'recipe_a')
      expect(create).not.toHaveBeenCalled()
    } finally {
      Date.now = realDateNow
    }
  })

  it('recordCook does not throw when the Mongo write fails', async () => {
    findOne.mockReturnValue({ sort: () => ({ exec: jest.fn().mockResolvedValue(null) }) })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
    create.mockRejectedValue(new Error('mongo down'))
    const service = await makeService()
    await expect(service.recordCook('user_1', 'recipe_a')).resolves.toBeUndefined()
  })

  it('countsById returns a count per recipe, aggregated across all users', async () => {
    aggregate.mockResolvedValue([{ _id: 'a', count: 3 }])
    const service = await makeService()
    const result = await service.countsById(['a', 'b'])
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { recipeId: { $in: ['a', 'b'] } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])
    expect(result).toEqual(new Map([['a', 3]]))
  })

  it('userCountsById returns a count per recipe, scoped to one user', async () => {
    aggregate.mockResolvedValue([{ _id: 'a', count: 2 }])
    const service = await makeService()
    const result = await service.userCountsById('user_1', ['a', 'b'])
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { userId: 'user_1', recipeId: { $in: ['a', 'b'] } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])
    expect(result).toEqual(new Map([['a', 2]]))
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd api && npx jest cook-log/cook-log.service.spec.ts`
Expected: FAIL — `recordCook`/`userCountsById` not defined, `create`/`recipeModel` unused providers mismatch

- [ ] **Step 5: Replace `api/src/cook-log/cook-log.service.ts` with:**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CookLog, CookLogDocument } from './schemas/cook-log.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'

interface CookCountAggregate { _id: string; count: number }

const COOLDOWN_FLOOR_MINUTES = 10

@Injectable()
export class CookLogService {
  constructor(
    @InjectModel(CookLog.name) private readonly cookLogModel: Model<CookLogDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly activityLog: ActivityLogService,
  ) {}

  // Called once, exactly when a guided cook session genuinely finishes
  // (CookSessionsService.finishSession) - never throws, since a failure
  // here must never be allowed to block that method from completing.
  async recordCook(userId: string, recipeId: string): Promise<void> {
    try {
      const recipe = await this.recipeModel.findOne({ _id: recipeId }).exec()
      const cooldownMinutes = Math.max(
        (recipe?.prepTime ?? 0) + (recipe?.cookTime ?? 0),
        COOLDOWN_FLOOR_MINUTES,
      )

      const lastCook = await this.cookLogModel
        .findOne({ userId, recipeId })
        .sort({ cookedAt: -1 })
        .exec()

      if (lastCook) {
        const minutesSinceLastCook = (Date.now() - lastCook.cookedAt.getTime()) / 60000
        if (minutesSinceLastCook < cooldownMinutes) return
      }

      await this.cookLogModel.create({ userId, recipeId, cookedAt: new Date() })
      await this.activityLog.record(userId, recipeId, 'recipe_cooked')
    } catch {
      // Counting a cook is a non-critical side effect - never let a
      // failure here surface to the caller.
    }
  }

  async countsById(recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.cookLogModel.aggregate([
      { $match: { recipeId: { $in: recipeIds } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])) as CookCountAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }

  async userCountsById(userId: string, recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.cookLogModel.aggregate([
      { $match: { userId, recipeId: { $in: recipeIds } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])) as CookCountAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd api && npx jest cook-log/cook-log.service.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: Replace `api/src/cook-log/cook-log.module.ts` with:**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookLog, CookLogSchema } from './schemas/cook-log.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { CookLogService } from './cook-log.service'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookLog.name, schema: CookLogSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    ActivityLogModule,
  ],
  providers: [CookLogService],
  exports: [CookLogService],
})
export class CookLogModule {}
```

(The `controllers: [CookLogController]` line and its import are removed - the module now only exports the service. Confirm `RecipeSchema`/`Recipe` are exported from `api/src/recipes/schemas/recipe.schema.ts` with those exact names before using this import - they are, per this same pattern already used in `api/src/recipes/recipes.module.ts` and `api/src/recipes/recipes.service.ts`.)

- [ ] **Step 8: Wire `recordCook` into `CookSessionsService.finishSession`**

`CookSessionsModule` needs `CookLogModule` in its imports so `CookLogService` can be injected. Find `api/src/cook-sessions/cook-sessions.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from './schemas/cook-session.schema'
import { CookSessionsService } from './cook-sessions.service'
import { CookSessionsController } from './cook-sessions.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: CookSession.name, schema: CookSessionSchema }])],
  providers: [CookSessionsService],
  controllers: [CookSessionsController],
})
export class CookSessionsModule {}
```

Replace with:

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from './schemas/cook-session.schema'
import { CookSessionsService } from './cook-sessions.service'
import { CookSessionsController } from './cook-sessions.controller'
import { CookLogModule } from '../cook-log/cook-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CookSession.name, schema: CookSessionSchema }]),
    CookLogModule,
  ],
  providers: [CookSessionsService],
  controllers: [CookSessionsController],
})
export class CookSessionsModule {}
```

In `api/src/cook-sessions/cook-sessions.service.ts`, add the import near the existing ones:

```ts
import { RedisService } from '../redis/redis.service'
```

becomes:

```ts
import { RedisService } from '../redis/redis.service'
import { CookLogService } from '../cook-log/cook-log.service'
```

Find the constructor:

```ts
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    private readonly redis: RedisService,
  ) {}
```

Replace with:

```ts
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    private readonly redis: RedisService,
    private readonly cookLogService: CookLogService,
  ) {}
```

Find `finishSession`'s Mongo-write block:

```ts
    const startedAt = new Date(session.startedAt)
    await this.cookSessionModel.create({
      userId: session.userId,
      recipeId: session.recipeId,
      startedAt,
      finishedAt,
      totalDurationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
      steps,
    })

    const client = this.redis.getClient()
    await client.del(redisKey(sessionId))
    await client.del(activeIndexKey(session.userId, session.recipeId))
  }
```

Replace with:

```ts
    const startedAt = new Date(session.startedAt)
    await this.cookSessionModel.create({
      userId: session.userId,
      recipeId: session.recipeId,
      startedAt,
      finishedAt,
      totalDurationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
      steps,
    })

    await this.cookLogService.recordCook(session.userId, session.recipeId)

    const client = this.redis.getClient()
    await client.del(redisKey(sessionId))
    await client.del(activeIndexKey(session.userId, session.recipeId))
  }
```

- [ ] **Step 9: Update `CookSessionsService`'s existing tests to satisfy the new constructor dependency**

In `api/src/cook-sessions/cook-sessions.service.spec.ts`, find the `makeService` helper (or wherever `Test.createTestingModule` is configured) and add a `CookLogService` mock provider alongside the existing `RedisService` one. Find:

```ts
  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookSessionsService,
        { provide: getModelToken(CookSession.name), useValue: model },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile()
    return moduleRef.get(CookSessionsService)
  }
```

Replace with:

```ts
  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookSessionsService,
        { provide: getModelToken(CookSession.name), useValue: model },
        { provide: RedisService, useValue: redisService },
        { provide: CookLogService, useValue: cookLogService },
      ],
    }).compile()
    return moduleRef.get(CookSessionsService)
  }
```

Add the mock and its import near the top of the file, alongside the other `const ... = jest.fn()` declarations:

```ts
import { RedisService } from '../redis/redis.service'
```

becomes:

```ts
import { RedisService } from '../redis/redis.service'
import { CookLogService } from '../cook-log/cook-log.service'
```

and add, near the other mock declarations (e.g. right after `const redisService = { getClient: () => redisClient }`):

```ts
  const recordCook = jest.fn()
  const cookLogService = { recordCook }
```

Then add `beforeEach(() => jest.clearAllMocks())` coverage is already in place (existing `beforeEach` block already calls `jest.clearAllMocks()` for the other mocks - confirm `recordCook` gets cleared too by that same call, since it's a plain `jest.fn()` in the same scope).

Find the `finishSession` test (`'finishSession computes per-step durations, writes the Mongo doc, and deletes both the session and index Redis keys'`) and add an assertion that `recordCook` was called with the right args, right after the existing `expect(create).toHaveBeenCalledWith(...)` assertion:

```ts
    expect(recordCook).toHaveBeenCalledWith('user_1', 'recipe_a')
```

- [ ] **Step 10: Run the cook-sessions tests to verify they pass**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: PASS

- [ ] **Step 11: Wire `userCookCount` into the recipe-detail response**

Find `attachRatingsAndViews` in `api/src/recipes/recipes.service.ts`:

```ts
    recipes: T[],
    ratings: Map<string, { avg: number; count: number }>,
    views: Map<string, number>,
    cooks: Map<string, number>,
  ) {
    const ownerIds = [...new Set(recipes.map(r => r.ownerId).filter((v): v is string => !!v))]
    const names = await this.usersService.namesByIds(ownerIds)
    return recipes.map(recipe => {
      const rating = ratings.get(recipe.id)
      return {
        ...recipe,
        averageRating: rating ? Math.round(rating.avg * 10) / 10 : null,
        ratingCount: rating?.count ?? 0,
        viewCount: views.get(recipe.id) ?? 0,
        cookCount: cooks.get(recipe.id) ?? 0,
        ownerName: recipe.ownerId ? names[recipe.ownerId] ?? null : null,
      }
    })
  }
```

Replace with:

```ts
    recipes: T[],
    ratings: Map<string, { avg: number; count: number }>,
    views: Map<string, number>,
    cooks: Map<string, number>,
    userCooks?: Map<string, number>,
  ) {
    const ownerIds = [...new Set(recipes.map(r => r.ownerId).filter((v): v is string => !!v))]
    const names = await this.usersService.namesByIds(ownerIds)
    return recipes.map(recipe => {
      const rating = ratings.get(recipe.id)
      return {
        ...recipe,
        averageRating: rating ? Math.round(rating.avg * 10) / 10 : null,
        ratingCount: rating?.count ?? 0,
        viewCount: views.get(recipe.id) ?? 0,
        cookCount: cooks.get(recipe.id) ?? 0,
        ...(userCooks ? { userCookCount: userCooks.get(recipe.id) ?? 0 } : {}),
        ownerName: recipe.ownerId ? names[recipe.ownerId] ?? null : null,
      }
    })
  }
```

Find `findByIdForUser`'s published-recipe branch:

```ts
    if (recipe.publishedRevision != null) {
      const base = isOwnerOrAdmin ? { ...recipe.toObject(), id: recipe.id } : await this.overlayPublishedSnapshot(recipe)
      const [ratings, views, cooks] = await Promise.all([
        this.ratingsById([recipe.id]),
        this.activityLogService.viewCountsById([recipe.id]),
        this.cookLogService.countsById([recipe.id]),
      ])
      return (await this.attachRatingsAndViews([base], ratings, views, cooks))[0]
    }
```

Replace with:

```ts
    if (recipe.publishedRevision != null) {
      const base = isOwnerOrAdmin ? { ...recipe.toObject(), id: recipe.id } : await this.overlayPublishedSnapshot(recipe)
      const [ratings, views, cooks, userCooks] = await Promise.all([
        this.ratingsById([recipe.id]),
        this.activityLogService.viewCountsById([recipe.id]),
        this.cookLogService.countsById([recipe.id]),
        this.cookLogService.userCountsById(userId, [recipe.id]),
      ])
      return (await this.attachRatingsAndViews([base], ratings, views, cooks, userCooks))[0]
    }
```

(`findAll`, `findPublishedByOwner`, and `findById` are NOT modified - they keep calling `attachRatingsAndViews` with 4 arguments, which is still valid since `userCooks` is optional and defaults to `undefined`, correctly omitting `userCookCount` from those responses per the Global Constraints.)

- [ ] **Step 12: Run the full API test suite**

Run: `cd api && npm test`
Expected: PASS, no regressions

- [ ] **Step 13: Commit**

```bash
git add api/src/cook-log api/src/cook-sessions api/src/recipes/recipes.service.ts src/hooks/useCookedRecipes.ts
git commit -m "$(cat <<'EOF'
feat: auto-count cooked recipes with a per-user cooldown

Phase E of the cook-mode redesign - CookLog is now an append-only,
timestamped event log (dropped the old unique-per-user boolean
index) instead of a manual toggle. CookSessionsService.finishSession
records a cook automatically the moment a guided session genuinely
completes, gated by a per-user cooldown
(max(prepTime+cookTime, 10min)) so a rapid restart-and-refinish
loop can't inflate the count - the CookSession Mongo record itself
is written either way, only the counter increment is gated.

countsById keeps its existing signature/semantics for every current
caller (now counting events instead of distinct users); a new
userCountsById feeds a new recipe.userCookCount field, wired only
into the single recipe-detail route that has a signed-in viewer
identity.

Deletes the dead manual "mark cooked" REST surface (POST/DELETE
/cooked/:id) and its frontend hook - zero callers since Phase A
removed the button that used them.

docs/superpowers/specs/2026-08-14-cook-counter-and-dock-polish-design.md
EOF
)"
```

---

## Task 2: Frontend — button/dock polish

**Files:**
- Modify: `src/i18n.ts`
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/components/CookDock.tsx`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `recipe.userCookCount?: number` (from Task 1's backend response - optional, present only on the signed-in single-recipe-detail fetch).
- Produces: `CookDockProps` gains `startExpanded?: boolean`; new i18n key `tx.stopCooking`.

- [ ] **Step 1: Add `userCookCount` to the frontend `Recipe` type**

Find in `src/types.ts`:

```ts
  cookCount?: number
```

Replace with:

```ts
  cookCount?: number
  userCookCount?: number
```

- [ ] **Step 2: Add the `stopCooking` i18n key**

In `src/i18n.ts`, find the `he` block's `closeGuidedMode` entry:

```ts
      closeGuidedMode: "סגור מצב הדרכה",
```

Add right after it:

```ts
      closeGuidedMode: "סגור מצב הדרכה",
      stopCooking: "הפסק בישול",
```

Find the `en` block's `closeGuidedMode` entry:

```ts
      closeGuidedMode: "Close guided mode",
```

Add right after it:

```ts
      closeGuidedMode: "Close guided mode",
      stopCooking: "Stop cooking",
```

- [ ] **Step 3: "Start cooking" button — remove the count badge, full width on mobile**

In `src/components/RecipeDetail.tsx`, find the button:

```tsx
            {isViewingPublishedContent && (
              <button type="button"
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  openWizard()
                }}
                className="relative overflow-hidden flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90"
              >
                <span className="text-lg leading-none">🍳</span>
                {tx.startCooking}
                {!!recipe.cookCount && (
                  <span className="opacity-70 text-xs">({recipe.cookCount})</span>
                )}
              </button>
            )}
```

Replace with:

```tsx
            {isViewingPublishedContent && (
              <button type="button"
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  openWizard()
                }}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90"
              >
                <span className="text-lg leading-none">🍳</span>
                {tx.startCooking}
              </button>
            )}
```

- [ ] **Step 4: `openWizard()` opens the dock already expanded**

Find `openWizard()` in `src/components/RecipeDetail.tsx` (the function whose body starts with `if (cookSessionActive) return`) and find the `<CookDock .../>` render call further down in the same file. First, add a new piece of state near the other `cookSession*` state declarations (find `const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)`):

```tsx
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
```

Replace with:

```tsx
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
  // Only true for the render right after a fresh "Start cooking" click -
  // reset immediately after CookDock reads it, so cross-device resume
  // (Phase D) and the discovery/polling effects never force-expand an
  // already-collapsed dock.
  const [startDockExpanded, setStartDockExpanded] = useState(false)
```

Find `openWizard()`'s opening lines:

```tsx
  function openWizard() {
    if (cookSessionActive) return
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    const startIndex = firstUnchecked === -1 ? 0 : firstUnchecked
    setWizardIndex(startIndex)
    setCookSessionActive(true)
```

Replace with:

```tsx
  function openWizard() {
    if (cookSessionActive) return
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    const startIndex = firstUnchecked === -1 ? 0 : firstUnchecked
    setWizardIndex(startIndex)
    setCookSessionActive(true)
    setStartDockExpanded(true)
```

Find the `<CookDock .../>` render call and add the new prop right after `lightboxOpen={!!lightboxUrl}` (or wherever the last prop currently sits - `elapsedBaselineMs` was the most recently added one):

```tsx
          elapsedBaselineMs={cookSessionStartedAt ? new Date(cookSessionStartedAt).getTime() : undefined}
```

becomes:

```tsx
          elapsedBaselineMs={cookSessionStartedAt ? new Date(cookSessionStartedAt).getTime() : undefined}
          startExpanded={startDockExpanded}
          onExpandConsumed={() => setStartDockExpanded(false)}
```

- [ ] **Step 5: `CookDock` reads `startExpanded` for its initial state, notifies the parent once consumed**

In `src/components/CookDock.tsx`, add the two new props to `CookDockProps` right after `elapsedBaselineMs?: number`:

```tsx
  elapsedBaselineMs?: number
}
```

becomes:

```tsx
  elapsedBaselineMs?: number
  startExpanded?: boolean
  onExpandConsumed?: () => void
}
```

Add them to the destructured props, right after `elapsedBaselineMs`:

```tsx
  onOpenLightbox, timerBarHeight, lightboxOpen, elapsedBaselineMs,
}: CookDockProps) {
```

becomes:

```tsx
  onOpenLightbox, timerBarHeight, lightboxOpen, elapsedBaselineMs, startExpanded, onExpandConsumed,
}: CookDockProps) {
```

Find the `expanded` state declaration:

```tsx
  const [expanded, setExpanded] = useState(false)
```

Replace with:

```tsx
  const [expanded, setExpanded] = useState(() => {
    if (startExpanded) onExpandConsumed?.()
    return !!startExpanded
  })
```

- [ ] **Step 6: Move the collapse chevron into its own centered strip; replace the ✕ with "Stop cooking"**

Find the expanded header block:

```tsx
      {expanded ? (
        <>
          <div className="flex items-center justify-between px-4 h-14 border-b border-tint/[0.06] shrink-0">
            <button type="button"
              onClick={e => { e.stopPropagation(); setExpandedState(false) }}
              aria-label={tx.collapse}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <span className="text-cream/40 text-sm">{collapsedStepLabel}</span>
            <button type="button"
              onClick={e => { e.stopPropagation(); onStop() }}
              aria-label={tx.closeGuidedMode}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
            >
              ✕
            </button>
          </div>
```

Replace with:

```tsx
      {expanded ? (
        <>
          <div className="flex items-center justify-center h-6 shrink-0" onClick={e => e.stopPropagation()}>
            <button type="button"
              onClick={() => setExpandedState(false)}
              aria-label={tx.collapse}
              className="h-6 w-16 flex items-center justify-center text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 h-14 border-b border-tint/[0.06] shrink-0">
            <span className="text-cream/40 text-sm">{collapsedStepLabel}</span>
            <button type="button"
              onClick={e => { e.stopPropagation(); onStop() }}
              className="px-3 h-9 flex items-center justify-center rounded-lg text-sm font-medium text-cream/60 hover:text-cream/90 transition-colors"
            >
              {tx.stopCooking}
            </button>
          </div>
```

- [ ] **Step 7: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/i18n.ts src/types.ts src/components/RecipeDetail.tsx src/components/CookDock.tsx
```

Expected: no errors, no unexpected warnings.

- [ ] **Step 8: Manual verification**

Start the dev server if not already running: open a recipe, confirm the "Start cooking" button has no `(N)` count inside it and stretches full-width on a mobile-width viewport (narrower than the `sm:` breakpoint) with visible left/right padding from its container, and reverts to content-width above that breakpoint. Click "Start cooking" and confirm the dock opens directly to its 90dvh expanded view (not collapsed). In the expanded view, confirm a small centered chevron strip sits above the header row, and the header row now reads a step label on one side and a "Stop cooking" text button (no ✕) on the other, which ends the session when clicked. Swipe/tap-collapse still works via the moved chevron. This step can't be run by an agentic implementer without a browser - note in the report if it wasn't possible, that's expected; Step 7's build/lint checks are the verifiable bar.

- [ ] **Step 9: Commit**

```bash
git add src/i18n.ts src/types.ts src/components/RecipeDetail.tsx src/components/CookDock.tsx
git commit -m "$(cat <<'EOF'
feat: cook dock polish - full-width button, opens expanded, drag handle

Phase E's UI half: "Start cooking" drops its inline (N) cook-count
badge and stretches full-width on mobile; clicking it now opens the
dock directly to its 90dvh expanded view instead of collapsed. The
expanded header's collapse chevron moves to its own centered strip
above the header row (drag-handle style); the icon-only close
button is replaced with a labeled "Stop cooking" text control.

docs/superpowers/specs/2026-08-14-cook-counter-and-dock-polish-design.md
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Schema drops unique index, gains `cookedAt` ✓ Task 1 Step 2. `recordCook` cooldown math + never-throws ✓ Task 1 Step 5. `finishSession` calls it, `CookSession` doc written regardless ✓ Task 1 Step 8 (call placed after the `create()`, not gating it). `countsById` signature preserved ✓ Task 1 Step 5. `userCountsById` added, wired only into `findByIdForUser`'s published branch ✓ Task 1 Step 11. Dead controller/hook deleted ✓ Task 1 Step 1. `recipe_cooked` activity-log convention preserved on the new trigger ✓ Task 1 Step 5. Button: no badge, full-width mobile ✓ Task 2 Step 3. Opens expanded ✓ Task 2 Steps 4-5. Chevron repositioned, ✕→"Stop cooking" ✓ Task 2 Step 6.
- **Placeholder scan:** No TBD/TODO; every code block is complete, including full test-file rewrites and exact find/replace blocks for the frontend.
- **Type consistency:** `CookLogService.recordCook`/`countsById`/`userCountsById` signatures match exactly between the service (Task 1 Step 5), its tests (Step 3), and the two call sites (`CookSessionsService.finishSession`, Step 8; `recipes.service.ts`, Step 11). `CookDockProps`'s new `startExpanded`/`onExpandConsumed` match exactly how `RecipeDetail.tsx` passes them (Task 2 Steps 4-5). `recipe.userCookCount` type (`number | undefined`) consistent between `src/types.ts` (Step 1) and the backend's conditional spread (Task 1 Step 11).
