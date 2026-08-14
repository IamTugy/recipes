# Cook Mode Redesign — Phase H: Recipe History & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated space for a user to see everything they've cooked (global history + aggregate stats) and drill into any recipe's own trend and per-step timing.

**Architecture:** A new read-only NestJS module (`api/src/cook-history/`) queries the existing `CookSession` collection (no schema changes) for three endpoints. Two new frontend pages, each backed by a small custom hook following this codebase's established `useCollections`-style pattern, render `recharts` bar charts (this app's first charting dependency).

**Tech Stack:** NestJS, Mongoose, React 19.2.4, Vite 8.0.4, TypeScript ~6.0.2, react-router-dom 7.14.0, `recharts` (new dependency, `^3.10.1`, peer-compatible with React 19).

## Global Constraints

- No schema changes — this phase only reads `CookSession` (and `Recipe` for titles), never writes.
- All three endpoints scoped to the authenticated caller (`req.userId`), no `@Public()`.
- `GET /cook-history/stats`: `totalRecipesCooked` = distinct `recipeId` count; `totalCooks` = total session count; `totalTimeSpentSeconds` = sum of `totalDurationSeconds`; `cooksByMonth` = trailing 12 months, zero-filled, `month` as `"YYYY-MM"`; `mostCooked` = top 5 recipes by session count.
- `GET /cook-history`: most-recent-first, capped at 100 entries (no cursor pagination).
- `GET /cook-history/:recipeId`: most-recent-first sessions for that recipe; each session's `steps` carry `stepNum`/`durationSeconds` only — never instruction text (a captured step doesn't track which recipe revision it belonged to).
- Any entry whose recipe title can't be resolved (deleted recipe, cast failure) is silently omitted from `stats.mostCooked` and `GET /cook-history` — matches the established convention from an earlier phase's final review (never surface an empty-string title to the user).
- New pages follow the exact loading/empty pattern already used by `CollectionsPage.tsx`: a custom hook returns `{ ..., loading }`; the page renders `loading ? <p className="text-cream/30 text-sm">{tx.loading}</p> : items.length === 0 ? <p className="text-cream/30 text-sm">{tx.emptyKey}</p> : <content/>` — no spinner/skeleton component, no bespoke error UI.
- `src/lib/cookHistory.ts` uses the `apiFetch`-typed-wrapper pattern (`src/lib/jobs.ts`'s style) — NOT the fire-and-forget swallow-to-null/empty pattern used by `src/lib/cookSessions.ts` (a different convention for a different purpose).
- New sidebar entry goes in `Sidebar.tsx`'s `moreLinks` array (not `recipeLinks`), same emoji-in-span icon idiom as the existing `leaderboard`/`feature-requests` entries.
- New routes registered in `App.tsx`'s existing `<Routes>` block, before the `/recipes/:id` route (matching where every other simple, no-prop page route already sits).

---

## Task 1: Backend — `api/src/cook-history/` module

**Files:**
- Create: `api/src/cook-history/cook-history.service.ts`
- Create: `api/src/cook-history/cook-history.service.spec.ts`
- Create: `api/src/cook-history/cook-history.controller.ts`
- Create: `api/src/cook-history/cook-history.controller.spec.ts`
- Create: `api/src/cook-history/cook-history.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Produces: `CookHistoryService.getStats(userId: string): Promise<CookHistoryStats>`, `.getHistory(userId: string): Promise<CookHistoryEntry[]>`, `.getRecipeHistory(userId: string, recipeId: string): Promise<CookRecipeHistoryView | null>`.
- Produces (HTTP, consumed by Task 2): `GET /cook-history/stats` → `CookHistoryStats`; `GET /cook-history` → `CookHistoryEntry[]`; `GET /cook-history/:recipeId` → `CookRecipeHistoryView` (404 if the recipe can't be resolved).
- Types:
  ```ts
  interface CookHistoryStats {
    totalRecipesCooked: number
    totalCooks: number
    totalTimeSpentSeconds: number
    cooksByMonth: { month: string; count: number }[]
    mostCooked: { recipeId: string; recipeTitle: string; count: number }[]
  }
  interface CookHistoryEntry {
    recipeId: string
    recipeTitle: string
    finishedAt: string
    totalDurationSeconds: number
  }
  interface CookRecipeHistoryView {
    recipeTitle: string
    sessions: { finishedAt: string; totalDurationSeconds: number; steps: { stepNum: number; durationSeconds: number }[] }[]
  }
  ```

- [ ] **Step 1: Write the failing service tests**

Create `api/src/cook-history/cook-history.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookHistoryService } from './cook-history.service'
import { CookSession } from '../cook-sessions/schemas/cook-session.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'

describe('CookHistoryService', () => {
  const cookSessionFind = jest.fn()
  const cookSessionModel = { find: cookSessionFind }
  const recipeFind = jest.fn()
  const recipeFindOne = jest.fn()
  const recipeModel = { find: recipeFind, findOne: recipeFindOne }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookHistoryService,
        { provide: getModelToken(CookSession.name), useValue: cookSessionModel },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
      ],
    }).compile()
    return moduleRef.get(CookHistoryService)
  }

  function chainable(result: unknown) {
    const exec = jest.fn().mockResolvedValue(result)
    const lean = jest.fn().mockReturnValue({ exec })
    const limit = jest.fn().mockReturnValue({ lean })
    const sort = jest.fn().mockReturnValue({ limit, lean })
    const select = jest.fn().mockReturnValue({ sort, lean, exec })
    return { select, sort, limit, lean, exec }
  }

  describe('getStats', () => {
    it('computes totalRecipesCooked as the count of distinct recipeIds', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: 'b', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'A' }, { _id: 'b', title: 'B' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalRecipesCooked).toBe(2)
    })

    it('computes totalCooks as the total session count', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'A' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalCooks).toBe(2)
    })

    it('sums totalDurationSeconds across all sessions', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 100 },
        { recipeId: 'b', finishedAt: new Date(), totalDurationSeconds: 250 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'A' }, { _id: 'b', title: 'B' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalTimeSpentSeconds).toBe(350)
    })

    it('returns 12 zero-filled months when there are no sessions', async () => {
      cookSessionFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.cooksByMonth).toHaveLength(12)
      expect(stats.cooksByMonth.every(m => m.count === 0)).toBe(true)
    })

    it('buckets a session into its finished month', async () => {
      const now = new Date()
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: now, totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'A' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const bucket = stats.cooksByMonth.find(m => m.month === thisMonthKey)
      expect(bucket?.count).toBe(1)
    })

    it('returns the top 5 most-cooked recipes by session count, with titles resolved', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: 'b', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'Chicken Soup' }, { _id: 'b', title: 'Toast' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.mostCooked[0]).toEqual({ recipeId: 'a', recipeTitle: 'Chicken Soup', count: 3 })
    })

    it('omits a most-cooked entry when its recipe title cannot be resolved', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.mostCooked).toEqual([])
    })
  })

  describe('getHistory', () => {
    it('returns entries sorted most-recent-first with resolved titles', async () => {
      const older = new Date('2026-01-01')
      const newer = new Date('2026-02-01')
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: newer, totalDurationSeconds: 60 },
        { recipeId: 'b', finishedAt: older, totalDurationSeconds: 90 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'A' }, { _id: 'b', title: 'B' }]))
      const service = await makeService()
      const result = await service.getHistory('user_1')
      expect(result).toEqual([
        { recipeId: 'a', recipeTitle: 'A', finishedAt: newer.toISOString(), totalDurationSeconds: 60 },
        { recipeId: 'b', recipeTitle: 'B', finishedAt: older.toISOString(), totalDurationSeconds: 90 },
      ])
      expect(cookSessionFind).toHaveBeenCalledWith({ userId: 'user_1' })
    })

    it('omits an entry whose recipe title cannot be resolved', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const result = await service.getHistory('user_1')
      expect(result).toEqual([])
    })

    it('returns an empty array without querying recipes when there are no sessions', async () => {
      cookSessionFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const result = await service.getHistory('user_1')
      expect(result).toEqual([])
      expect(recipeFind).not.toHaveBeenCalled()
    })
  })

  describe('getRecipeHistory', () => {
    it('returns the recipe title and its sessions, most-recent-first', async () => {
      recipeFindOne.mockReturnValue(chainable({ title: 'Chicken Soup' }))
      const older = new Date('2026-01-01')
      const newer = new Date('2026-02-01')
      cookSessionFind.mockReturnValue(chainable([
        { finishedAt: newer, totalDurationSeconds: 120, steps: [{ stepNum: 1, durationSeconds: 60 }] },
        { finishedAt: older, totalDurationSeconds: 90, steps: [] },
      ]))
      const service = await makeService()
      const result = await service.getRecipeHistory('user_1', 'recipe_a')
      expect(result).toEqual({
        recipeTitle: 'Chicken Soup',
        sessions: [
          { finishedAt: newer.toISOString(), totalDurationSeconds: 120, steps: [{ stepNum: 1, durationSeconds: 60 }] },
          { finishedAt: older.toISOString(), totalDurationSeconds: 90, steps: [] },
        ],
      })
      expect(cookSessionFind).toHaveBeenCalledWith({ userId: 'user_1', recipeId: 'recipe_a' })
    })

    it('returns null when the recipe cannot be found', async () => {
      recipeFindOne.mockReturnValue(chainable(null))
      const service = await makeService()
      const result = await service.getRecipeHistory('user_1', 'recipe_missing')
      expect(result).toBeNull()
    })

    it('returns null instead of throwing when the recipe id is malformed', async () => {
      recipeFindOne.mockReturnValue({ select: () => ({ lean: () => ({ exec: jest.fn().mockRejectedValue(new Error('cast error')) }) }) })
      const service = await makeService()
      const result = await service.getRecipeHistory('user_1', 'not-a-valid-id')
      expect(result).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx jest cook-history/cook-history.service.spec.ts`
Expected: FAIL — `Cannot find module './cook-history.service'`

- [ ] **Step 3: Implement the service**

Create `api/src/cook-history/cook-history.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CookSession, CookSessionDocument } from '../cook-sessions/schemas/cook-session.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'

const HISTORY_PAGE_SIZE = 100
const TRAILING_MONTHS = 12
const MOST_COOKED_LIMIT = 5

export interface CookHistoryStats {
  totalRecipesCooked: number
  totalCooks: number
  totalTimeSpentSeconds: number
  cooksByMonth: { month: string; count: number }[]
  mostCooked: { recipeId: string; recipeTitle: string; count: number }[]
}

export interface CookHistoryEntry {
  recipeId: string
  recipeTitle: string
  finishedAt: string
  totalDurationSeconds: number
}

export interface CookRecipeHistoryView {
  recipeTitle: string
  sessions: {
    finishedAt: string
    totalDurationSeconds: number
    steps: { stepNum: number; durationSeconds: number }[]
  }[]
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

@Injectable()
export class CookHistoryService {
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
  ) {}

  private async resolveTitles(recipeIds: string[]): Promise<Map<string, string>> {
    if (recipeIds.length === 0) return new Map()
    const recipes = await this.recipeModel
      .find({ _id: { $in: recipeIds } })
      .select('title')
      .lean()
      .exec()
    return new Map(recipes.map(r => [String(r._id), r.title]))
  }

  async getStats(userId: string): Promise<CookHistoryStats> {
    const sessions = await this.cookSessionModel
      .find({ userId })
      .select('recipeId finishedAt totalDurationSeconds')
      .lean()
      .exec()

    const totalCooks = sessions.length
    const totalRecipesCooked = new Set(sessions.map(s => s.recipeId)).size
    const totalTimeSpentSeconds = sessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0)

    const now = new Date()
    const cooksByMonth: { month: string; count: number }[] = []
    for (let i = TRAILING_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      cooksByMonth.push({ month: monthKey(d), count: 0 })
    }
    const monthIndex = new Map(cooksByMonth.map((m, i) => [m.month, i]))
    for (const s of sessions) {
      const idx = monthIndex.get(monthKey(new Date(s.finishedAt)))
      if (idx !== undefined) cooksByMonth[idx].count++
    }

    const countByRecipe = new Map<string, number>()
    for (const s of sessions) countByRecipe.set(s.recipeId, (countByRecipe.get(s.recipeId) ?? 0) + 1)
    const topRecipeIds = [...countByRecipe.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST_COOKED_LIMIT)
    const titleById = await this.resolveTitles(topRecipeIds.map(([id]) => id))
    const mostCooked = topRecipeIds
      .map(([recipeId, count]) => {
        const recipeTitle = titleById.get(recipeId)
        return recipeTitle ? { recipeId, recipeTitle, count } : null
      })
      .filter((r): r is { recipeId: string; recipeTitle: string; count: number } => r !== null)

    return { totalRecipesCooked, totalCooks, totalTimeSpentSeconds, cooksByMonth, mostCooked }
  }

  async getHistory(userId: string): Promise<CookHistoryEntry[]> {
    const sessions = await this.cookSessionModel
      .find({ userId })
      .select('recipeId finishedAt totalDurationSeconds')
      .sort({ finishedAt: -1 })
      .limit(HISTORY_PAGE_SIZE)
      .lean()
      .exec()
    if (sessions.length === 0) return []

    const recipeIds = [...new Set(sessions.map(s => s.recipeId))]
    const titleById = await this.resolveTitles(recipeIds)

    return sessions
      .map(s => {
        const recipeTitle = titleById.get(s.recipeId)
        if (!recipeTitle) return null
        return {
          recipeId: s.recipeId,
          recipeTitle,
          finishedAt: s.finishedAt.toISOString(),
          totalDurationSeconds: s.totalDurationSeconds,
        }
      })
      .filter((e): e is CookHistoryEntry => e !== null)
  }

  async getRecipeHistory(userId: string, recipeId: string): Promise<CookRecipeHistoryView | null> {
    let recipe: { title: string } | null = null
    try {
      recipe = await this.recipeModel.findOne({ _id: recipeId }).select('title').lean().exec()
    } catch {
      return null
    }
    if (!recipe) return null

    const sessions = await this.cookSessionModel
      .find({ userId, recipeId })
      .select('finishedAt totalDurationSeconds steps')
      .sort({ finishedAt: -1 })
      .lean()
      .exec()

    return {
      recipeTitle: recipe.title,
      sessions: sessions.map(s => ({
        finishedAt: s.finishedAt.toISOString(),
        totalDurationSeconds: s.totalDurationSeconds,
        steps: s.steps.map(step => ({ stepNum: step.stepNum, durationSeconds: step.durationSeconds })),
      })),
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx jest cook-history/cook-history.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Write the failing controller tests**

Create `api/src/cook-history/cook-history.controller.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { CookHistoryController } from './cook-history.controller'

describe('CookHistoryController', () => {
  const cookHistoryService = {
    getStats: jest.fn(),
    getHistory: jest.fn(),
    getRecipeHistory: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('GET /cook-history/stats returns stats for the authenticated user', async () => {
    const stats = { totalRecipesCooked: 2, totalCooks: 3, totalTimeSpentSeconds: 300, cooksByMonth: [], mostCooked: [] }
    cookHistoryService.getStats.mockResolvedValue(stats)
    const controller = new CookHistoryController(cookHistoryService as any)
    const result = await controller.getStats({ userId: 'user_1' } as any)
    expect(cookHistoryService.getStats).toHaveBeenCalledWith('user_1')
    expect(result).toEqual(stats)
  })

  it('GET /cook-history returns the history list for the authenticated user', async () => {
    const entries = [{ recipeId: 'a', recipeTitle: 'A', finishedAt: '2026-01-01T00:00:00.000Z', totalDurationSeconds: 60 }]
    cookHistoryService.getHistory.mockResolvedValue(entries)
    const controller = new CookHistoryController(cookHistoryService as any)
    const result = await controller.getHistory({ userId: 'user_1' } as any)
    expect(cookHistoryService.getHistory).toHaveBeenCalledWith('user_1')
    expect(result).toEqual(entries)
  })

  it('GET /cook-history/:recipeId returns the per-recipe history', async () => {
    const view = { recipeTitle: 'A', sessions: [] }
    cookHistoryService.getRecipeHistory.mockResolvedValue(view)
    const controller = new CookHistoryController(cookHistoryService as any)
    const result = await controller.getRecipeHistory('recipe_a', { userId: 'user_1' } as any)
    expect(cookHistoryService.getRecipeHistory).toHaveBeenCalledWith('user_1', 'recipe_a')
    expect(result).toEqual(view)
  })

  it('GET /cook-history/:recipeId throws NotFoundException when the recipe cannot be resolved', async () => {
    cookHistoryService.getRecipeHistory.mockResolvedValue(null)
    const controller = new CookHistoryController(cookHistoryService as any)
    await expect(controller.getRecipeHistory('recipe_missing', { userId: 'user_1' } as any))
      .rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd api && npx jest cook-history/cook-history.controller.spec.ts`
Expected: FAIL — `Cannot find module './cook-history.controller'`

- [ ] **Step 7: Implement the controller**

Create `api/src/cook-history/cook-history.controller.ts`. Route order matters: the static `stats` route and the bare root route must be declared before the dynamic `:recipeId` route, or NestJS would match `GET /cook-history/stats` against `:recipeId` first.

```ts
import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookHistoryService } from './cook-history.service'

@Controller('cook-history')
export class CookHistoryController {
  constructor(private readonly cookHistoryService: CookHistoryService) {}

  @Get('stats')
  async getStats(@Req() req: Request & { userId: string }) {
    return this.cookHistoryService.getStats(req.userId)
  }

  @Get()
  async getHistory(@Req() req: Request & { userId: string }) {
    return this.cookHistoryService.getHistory(req.userId)
  }

  @Get(':recipeId')
  async getRecipeHistory(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    const result = await this.cookHistoryService.getRecipeHistory(req.userId, recipeId)
    if (!result) throw new NotFoundException()
    return result
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd api && npx jest cook-history/cook-history.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Create the module and register it**

Create `api/src/cook-history/cook-history.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from '../cook-sessions/schemas/cook-session.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { CookHistoryService } from './cook-history.service'
import { CookHistoryController } from './cook-history.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookSession.name, schema: CookSessionSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
  ],
  providers: [CookHistoryService],
  controllers: [CookHistoryController],
})
export class CookHistoryModule {}
```

In `api/src/app.module.ts`, find:

```ts
import { CookSessionsModule } from './cook-sessions/cook-sessions.module'
```

becomes:

```ts
import { CookSessionsModule } from './cook-sessions/cook-sessions.module'
import { CookHistoryModule } from './cook-history/cook-history.module'
```

Find:

```ts
    CookLogModule,
    CookSessionsModule,
    MealPlanModule,
```

Replace with:

```ts
    CookLogModule,
    CookSessionsModule,
    CookHistoryModule,
    MealPlanModule,
```

- [ ] **Step 10: Run the full API test suite**

Run: `cd api && npm test`
Expected: PASS, no regressions

- [ ] **Step 11: Commit**

```bash
git add api/src/cook-history api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat: add cook-history backend module (stats, list, per-recipe drill-down)

Phase H of the cook-mode redesign - a new read-only module reading
the existing CookSession collection (Phase C, no schema changes):
GET /cook-history/stats (totals, trailing-12-month bucketing,
top-5 most-cooked), GET /cook-history (capped, most-recent-first
list), GET /cook-history/:recipeId (per-recipe sessions with
step-level duration data). Any entry whose recipe title can't be
resolved is silently omitted, matching the convention established
in an earlier phase's final review.

docs/superpowers/specs/2026-08-15-cook-history-analytics-design.md
EOF
)"
```

---

## Task 2: Frontend — global history page (`/cook-history`)

**Files:**
- Modify: root `package.json` (adds `recharts`)
- Create: `src/lib/cookHistory.ts`
- Create: `src/hooks/useCookHistory.ts`
- Create: `src/components/CookHistoryPage.tsx`
- Modify: `src/i18n.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes (from Task 1, via HTTP): `GET /cook-history/stats`, `GET /cook-history`.
- Produces: `src/lib/cookHistory.ts` exports `CookHistoryStats`, `CookHistoryEntry`, `fetchCookHistoryStats(getToken): Promise<CookHistoryStats>`, `fetchCookHistory(getToken): Promise<CookHistoryEntry[]>` (Task 3 also needs `fetchCookRecipeHistory` and `CookRecipeHistory`/`CookRecipeHistorySession` from this same file, defined in Task 3 to keep this task's diff focused on what it uses).

- [ ] **Step 1: Install `recharts`**

```bash
npm install recharts
```

- [ ] **Step 2: Create `src/lib/cookHistory.ts`**

```ts
import { apiFetch } from './api'

export interface CookHistoryStats {
  totalRecipesCooked: number
  totalCooks: number
  totalTimeSpentSeconds: number
  cooksByMonth: { month: string; count: number }[]
  mostCooked: { recipeId: string; recipeTitle: string; count: number }[]
}

export interface CookHistoryEntry {
  recipeId: string
  recipeTitle: string
  finishedAt: string
  totalDurationSeconds: number
}

export function fetchCookHistoryStats(getToken: () => Promise<string | null>): Promise<CookHistoryStats> {
  return apiFetch<CookHistoryStats>('/cook-history/stats', getToken)
}

export function fetchCookHistory(getToken: () => Promise<string | null>): Promise<CookHistoryEntry[]> {
  return apiFetch<CookHistoryEntry[]>('/cook-history', getToken)
}
```

- [ ] **Step 3: Create `src/hooks/useCookHistory.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchCookHistoryStats, fetchCookHistory, CookHistoryStats, CookHistoryEntry } from '../lib/cookHistory'

export function useCookHistory() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [stats, setStats] = useState<CookHistoryStats | null>(null)
  const [entries, setEntries] = useState<CookHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn) return
    Promise.all([fetchCookHistoryStats(getToken), fetchCookHistory(getToken)])
      .then(([statsResult, entriesResult]) => {
        setStats(statsResult)
        setEntries(entriesResult)
      })
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => { load() }, [load])

  return { stats, entries, loading }
}
```

- [ ] **Step 4: Add i18n keys**

In `src/i18n.ts`, find the `he` block's `startCooking`-adjacent block where earlier phase keys were added (e.g. right after `reminderToReview`, added in an earlier phase) and add:

```ts
      cookHistory: "היסטוריית בישול",
      recipesCooked: "מתכונים שבישלתם",
      timesCooked2: "פעמים שבישלתם",
      totalTimeCooking: "זמן בישול כולל",
      cooksPerMonth: "בישולים לפי חודש",
      mostCookedRecipes: "המתכונים הכי מבושלים",
      noCookHistoryYet: "עוד לא בישלתם שום דבר - התחילו לבשל כדי לראות היסטוריה כאן",
      timesCooked: (n: number) => `בושל ${n} פעמים`,
      averageTime: "זמן ממוצע",
      backToRecipe: "חזרה למתכון",
      cookedOn: (date: string) => `בושל ב-${date}`,
      stepShort: (n: number) => `שלב ${n}`,
```

In the `en` block, find the equivalent spot and add:

```ts
      cookHistory: "Cook History",
      recipesCooked: "Recipes cooked",
      timesCooked2: "Times cooked",
      totalTimeCooking: "Total time cooking",
      cooksPerMonth: "Cooks per month",
      mostCookedRecipes: "Most cooked recipes",
      noCookHistoryYet: "You haven't cooked anything yet - start cooking to see your history here",
      timesCooked: (n: number) => `Cooked ${n} time${n === 1 ? '' : 's'}`,
      averageTime: "Average time",
      backToRecipe: "Back to recipe",
      cookedOn: (date: string) => `Cooked on ${date}`,
      stepShort: (n: number) => `Step ${n}`,
```

(Exact insertion point: search for the most recently added key from an earlier phase, e.g. `reminderToReview`, in each language block and add these new keys immediately after it, so they land in the same neighborhood as the rest of this cook-mode series' i18n additions.)

- [ ] **Step 5: Create `src/components/CookHistoryPage.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useCookHistory } from '../hooks/useCookHistory'
import { useLanguage } from '../hooks/useLanguage'
import { formatTime } from '../utils/format'
import { t } from '../i18n'

export default function CookHistoryPage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const { stats, entries, loading } = useCookHistory()

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {tx.cookHistory}
        </h1>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : entries.length === 0 ? (
          <p className="text-cream/30 text-sm">{tx.noCookHistoryYet}</p>
        ) : (
          <div className="space-y-6">
            {stats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <div className="text-2xl font-bold text-amber">{stats.totalRecipesCooked}</div>
                  <div className="text-xs text-cream/40 mt-1">{tx.recipesCooked}</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-2xl font-bold text-amber">{stats.totalCooks}</div>
                  <div className="text-xs text-cream/40 mt-1">{tx.timesCooked2}</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-2xl font-bold text-amber">{formatTime(Math.round(stats.totalTimeSpentSeconds / 60))}</div>
                  <div className="text-xs text-cream/40 mt-1">{tx.totalTimeCooking}</div>
                </div>
              </div>
            )}

            {stats && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-cream/70 mb-3">{tx.cooksPerMonth}</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.cooksByMonth}>
                    <XAxis dataKey="month" stroke="#cream" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="#cream" fontSize={10} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {stats && stats.mostCooked.length > 0 && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-cream/70 mb-3">{tx.mostCookedRecipes}</h2>
                <ul className="space-y-2">
                  {stats.mostCooked.map(r => (
                    <li key={r.recipeId}>
                      <Link to={`/cook-history/${r.recipeId}`} className="flex items-center justify-between text-sm text-cream/80 hover:text-cream transition-colors">
                        <span>{r.recipeTitle}</span>
                        <span className="text-cream/40">{tx.timesCooked(r.count)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              {entries.map((entry, i) => (
                <Link
                  key={`${entry.recipeId}-${entry.finishedAt}-${i}`}
                  to={`/cook-history/${entry.recipeId}`}
                  className="card p-3 flex items-center justify-between text-sm hover:bg-tint/[0.03] transition-colors"
                >
                  <span className="text-cream/80">{entry.recipeTitle}</span>
                  <span className="text-cream/40 text-xs">
                    {new Date(entry.finishedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')} · {formatTime(Math.round(entry.totalDurationSeconds / 60))}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add the sidebar entry**

In `src/components/Sidebar.tsx`, find:

```tsx
  const moreLinks: SidebarLinkDef[] = [
    { key: 'leaderboard', label: tx.leaderboard, path: '/leaderboard', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">🏆</span> },
    { key: 'feature-requests', label: tx.featureRequests, path: '/feature-requests', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">💡</span> },
  ]
```

Replace with:

```tsx
  const moreLinks: SidebarLinkDef[] = [
    { key: 'cook-history', label: tx.cookHistory, path: '/cook-history', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">📊</span> },
    { key: 'leaderboard', label: tx.leaderboard, path: '/leaderboard', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">🏆</span> },
    { key: 'feature-requests', label: tx.featureRequests, path: '/feature-requests', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">💡</span> },
  ]
```

- [ ] **Step 7: Register the route**

In `src/App.tsx`, find the import block (search for `import LeaderboardPage from './components/LeaderboardPage'`):

```tsx
import LeaderboardPage from './components/LeaderboardPage'
```

becomes:

```tsx
import LeaderboardPage from './components/LeaderboardPage'
import CookHistoryPage from './components/CookHistoryPage'
```

Find:

```tsx
          <Route path="/leaderboard" element={<LeaderboardPage />} />
```

Replace with:

```tsx
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/cook-history" element={<CookHistoryPage />} />
```

(Task 3 adds the `/cook-history/:recipeId` route in the same spot — for now this task only wires the global page's route.)

- [ ] **Step 8: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/lib/cookHistory.ts src/hooks/useCookHistory.ts src/components/CookHistoryPage.tsx src/i18n.ts src/components/Sidebar.tsx src/App.tsx
```

Expected: no errors, no unexpected warnings.

- [ ] **Step 9: Manual verification**

With the backend running and a signed-in user who has finished at least one guided cook: confirm the sidebar's "More" section now shows "Cook History" linking to `/cook-history`, the page shows the three stat cards, the cooks-per-month bar chart renders, the most-cooked list appears (if applicable), and the chronological list below shows each past cook with a date and duration, each linking to `/cook-history/:recipeId` (a 404 until Task 3 lands - expected at this point). A signed-in user with zero cook history should see the empty-state message instead. This step can't be run by an agentic implementer without live infra and cook history data - note in the report if it wasn't possible, that's expected; Step 8's build/lint checks are the verifiable bar.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/lib/cookHistory.ts src/hooks/useCookHistory.ts src/components/CookHistoryPage.tsx src/i18n.ts src/components/Sidebar.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add global cook-history page with stats and bar chart

Phase H frontend (1 of 2): a new /cook-history page - three stat
cards (recipes cooked, total cooks, total time), a recharts bar
chart of cooks-per-month, a most-cooked-recipes list, and a
chronological list of past cooks, each linking to a per-recipe
drill-down (Task 3). New sidebar entry, recharts added as this
app's first charting dependency. Follows CollectionsPage.tsx's
established loading/empty pattern exactly.

docs/superpowers/specs/2026-08-15-cook-history-analytics-design.md
EOF
)"
```

---

## Task 3: Frontend — per-recipe drill-down page (`/cook-history/:recipeId`)

**Files:**
- Modify: `src/lib/cookHistory.ts`
- Create: `src/hooks/useCookRecipeHistory.ts`
- Create: `src/components/CookHistoryRecipePage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes (from Task 1, via HTTP): `GET /cook-history/:recipeId`.
- Produces: `src/lib/cookHistory.ts` gains `CookRecipeHistorySession`, `CookRecipeHistory`, `fetchCookRecipeHistory(recipeId, getToken): Promise<CookRecipeHistory>`.

- [ ] **Step 1: Extend `src/lib/cookHistory.ts`**

Append to the end of the file:

```ts

export interface CookRecipeHistorySession {
  finishedAt: string
  totalDurationSeconds: number
  steps: { stepNum: number; durationSeconds: number }[]
}

export interface CookRecipeHistory {
  recipeTitle: string
  sessions: CookRecipeHistorySession[]
}

export function fetchCookRecipeHistory(
  recipeId: string,
  getToken: () => Promise<string | null>
): Promise<CookRecipeHistory> {
  return apiFetch<CookRecipeHistory>(`/cook-history/${recipeId}`, getToken)
}
```

- [ ] **Step 2: Create `src/hooks/useCookRecipeHistory.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchCookRecipeHistory, CookRecipeHistory } from '../lib/cookHistory'

export function useCookRecipeHistory(recipeId: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [history, setHistory] = useState<CookRecipeHistory | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn || !recipeId) return
    fetchCookRecipeHistory(recipeId, getToken)
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken, recipeId])

  useEffect(() => { load() }, [load])

  return { history, loading }
}
```

- [ ] **Step 3: Create `src/components/CookHistoryRecipePage.tsx`**

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useCookRecipeHistory } from '../hooks/useCookRecipeHistory'
import { useLanguage } from '../hooks/useLanguage'
import { formatTime } from '../utils/format'
import { t } from '../i18n'

export default function CookHistoryRecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { history, loading } = useCookRecipeHistory(recipeId)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const trendData = history?.sessions
    .slice()
    .reverse()
    .map((s, i) => ({ index: i + 1, minutes: Math.round(s.totalDurationSeconds / 60) })) ?? []

  const totalTimeSeconds = history?.sessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0) ?? 0
  const averageMinutes = history && history.sessions.length > 0
    ? Math.round(totalTimeSeconds / history.sessions.length / 60)
    : 0

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/cook-history" className="text-xs text-cream/40 hover:text-cream/70 transition-colors mb-4 inline-block">
          ← {tx.cookHistory}
        </Link>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : !history ? (
          <p className="text-cream/30 text-sm">{tx.noCookHistoryYet}</p>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="font-serif text-2xl font-bold text-cream">{history.recipeTitle}</h1>
              {recipeId && (
                <Link to={`/recipes/${recipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors shrink-0">
                  {tx.backToRecipe}
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-amber">{history.sessions.length}</div>
                <div className="text-xs text-cream/40 mt-1">{tx.timesCooked2}</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-amber">{formatTime(averageMinutes)}</div>
                <div className="text-xs text-cream/40 mt-1">{tx.averageTime}</div>
              </div>
            </div>

            {trendData.length > 1 && (
              <div className="card p-4">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={trendData}>
                    <XAxis dataKey="index" stroke="#cream" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#cream" fontSize={10} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="minutes" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-2">
              {history.sessions.map((session, i) => (
                <div key={`${session.finishedAt}-${i}`} className="card p-3">
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    className="w-full flex items-center justify-between text-sm text-cream/80"
                  >
                    <span>{new Date(session.finishedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
                    <span className="text-cream/40 text-xs">{formatTime(Math.round(session.totalDurationSeconds / 60))}</span>
                  </button>
                  {expandedIndex === i && session.steps.length > 0 && (
                    <div className="mt-3">
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={session.steps.map(s => ({ label: tx.stepShort(s.stepNum), seconds: s.durationSeconds }))}>
                          <XAxis dataKey="label" stroke="#cream" fontSize={9} tickLine={false} axisLine={false} />
                          <YAxis stroke="#cream" fontSize={9} tickLine={false} axisLine={false} width={24} />
                          <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 12 }} />
                          <Bar dataKey="seconds" fill="#d97706" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Register the route**

In `src/App.tsx`, find:

```tsx
import CookHistoryPage from './components/CookHistoryPage'
```

becomes:

```tsx
import CookHistoryPage from './components/CookHistoryPage'
import CookHistoryRecipePage from './components/CookHistoryRecipePage'
```

Find:

```tsx
          <Route path="/cook-history" element={<CookHistoryPage />} />
```

Replace with:

```tsx
          <Route path="/cook-history" element={<CookHistoryPage />} />
          <Route path="/cook-history/:recipeId" element={<CookHistoryRecipePage />} />
```

- [ ] **Step 5: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/lib/cookHistory.ts src/hooks/useCookRecipeHistory.ts src/components/CookHistoryRecipePage.tsx src/App.tsx
```

Expected: no errors, no unexpected warnings.

- [ ] **Step 6: Manual verification**

With the backend running: click through from `/cook-history` into a recipe that's been cooked more than once - confirm the drill-down shows the recipe title, times-cooked/average-time stat cards, a trend chart (only when there are 2+ sessions), and a list of individual cooks; expanding one with recorded steps shows a small per-step duration bar chart. Confirm "Back to recipe" links to the recipe's own `/recipes/:id` page. This step can't be run by an agentic implementer without live infra and cook history data - note in the report if it wasn't possible, that's expected; Step 5's build/lint checks are the verifiable bar.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cookHistory.ts src/hooks/useCookRecipeHistory.ts src/components/CookHistoryRecipePage.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add per-recipe cook-history drill-down page

Phase H frontend (2 of 2): /cook-history/:recipeId shows a single
recipe's own cook stats (times cooked, average time), a trend chart
across sessions, and an expandable per-session list with per-step
duration bar charts where step timing was recorded. Completes the
cook-mode redesign (Phases A-H).

docs/superpowers/specs/2026-08-15-cook-history-analytics-design.md
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** `stats`/`history`/`:recipeId` endpoints match the spec's exact shapes ✓ Task 1 Step 3. Missing-title omission convention applied consistently ✓ Task 1 Step 3 (`getStats`'s `mostCooked` and `getHistory`). 100-entry cap, most-recent-first ✓ Task 1 Step 3 (`.limit(HISTORY_PAGE_SIZE).sort({finishedAt: -1})`). Step labels are numbers only, no instruction text ✓ Task 1's `CookRecipeHistoryView` type never carries `stepKey` or any recipe-step text. Stat cards + bar chart + most-cooked + chronological list ✓ Task 2 Step 5. Per-recipe stats + trend + expandable per-step chart ✓ Task 3 Step 3. Sidebar entry, route registration ✓ Task 2 Steps 6-7, Task 3 Step 4. `recharts` added, no other new dependency ✓ Task 2 Step 1. Loading/empty pattern matches `CollectionsPage.tsx` exactly ✓ both page components' top-level ternary. `apiFetch`-based lib (not the fire-and-forget `cookSessions.ts` pattern) ✓ Task 2 Step 2, Task 3 Step 1.
- **Placeholder scan:** No TBD/TODO; every code block is complete, including full test suites and both new page components in full.
- **Type consistency:** `CookHistoryStats`/`CookHistoryEntry`/`CookRecipeHistoryView` (backend, Task 1) match `CookHistoryStats`/`CookHistoryEntry`/`CookRecipeHistory`+`CookRecipeHistorySession` (frontend, Tasks 2-3) field-for-field. `getStats`/`getHistory`/`getRecipeHistory` signatures consistent between the service, its tests, and the controller. `useCookHistory`/`useCookRecipeHistory` return shapes match exactly what `CookHistoryPage.tsx`/`CookHistoryRecipePage.tsx` destructure.
