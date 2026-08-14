# Cook Mode Redesign — Phase F: Cook-Conflict Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn a user when starting a cook on a different recipe while one is already active elsewhere, letting them cancel or proceed (abandoning the old session); show real visual feedback ("Cooking...") on the recipe currently being cooked instead of a silently-inert button.

**Architecture:** Add one new per-user Redis pointer (`cook-session-current:{userId}`) to the existing `api/src/cook-sessions/` module, maintained alongside the existing session/index keys, plus a new `GET /cook-sessions/current` endpoint. `RecipeDetail.tsx`'s "Start cooking" click handler checks that endpoint lazily (only on click, never on page load); if it names a different recipe, a `ConfirmDialog` (reusing the component already used twice in this file) gates proceeding.

**Tech Stack:** NestJS, Mongoose, ioredis, React/Vite. No new dependencies.

## Global Constraints

- New Redis key `cook-session-current:{userId}` → JSON `{ sessionId, recipeId, recipeTitle }`, same `SESSION_TTL_SECONDS` (86400) refresh semantics as the existing per-session/per-recipe-index keys — set on `startSession`, refreshed alongside every write that already refreshes the per-recipe index (`logStep`, `syncState`), deleted on `finishSession`/`abandonSession`.
- `startSession` looks up the recipe's title via the `Recipe` Mongoose model (mirrors the existing pattern already used by `CookLogService` for `prepTime`/`cookTime`) — uses the recipe's `title` field (required at the schema level, always populated; `titleHe` is optional and not used here since the API has no notion of the caller's UI language).
- `GET /cook-sessions/current` returns the pointer's contents (`{ sessionId, recipeId, recipeTitle }`) or `null` (HTTP 200, not an error) — scoped to the authenticated caller via `req.userId`, same auth convention as every other endpoint in this controller (no `@Public()`).
- The check against this endpoint happens lazily, only at the moment "Start cooking" is clicked — never proactively on page load.
- Popup only appears when the current pointer names a genuinely different `recipeId` than the one being started; a `null` result or a match on the same recipe proceeds straight to starting, no popup.
- Confirming the popup calls the existing `abandonCookSession` on the OLD session before proceeding with today's normal start flow on the current recipe.
- The "Start cooking" button becomes `disabled` and shows a new `tx.cooking` label instead of `tx.startCooking` whenever `cookSessionActive` is true for the currently-viewed recipe.
- The popup reuses the existing `ConfirmDialog` component (`src/components/ConfirmDialog.tsx`) — same prop shape/usage pattern already used twice in `RecipeDetail.tsx` (delete-recipe and publish-recipe confirmations).
- The `GET /cook-sessions/current` call is best-effort: on failure, `openWizard()`'s caller proceeds as if no conflict exists (never blocks starting a cook).
- No new npm dependencies.

---

## Task 1: Backend — per-user "current cook" pointer + discovery endpoint

**Files:**
- Modify: `api/src/cook-sessions/cook-sessions.service.ts`
- Modify: `api/src/cook-sessions/cook-sessions.service.spec.ts`
- Modify: `api/src/cook-sessions/cook-sessions.controller.ts`
- Modify: `api/src/cook-sessions/cook-sessions.controller.spec.ts`
- Modify: `api/src/cook-sessions/cook-sessions.module.ts`

**Interfaces:**
- Produces: `CookSessionsService.getCurrentSession(userId: string): Promise<CurrentCookSessionView | null>` where `CurrentCookSessionView = { sessionId: string; recipeId: string; recipeTitle: string }`.
- Produces (HTTP, consumed by Task 2): `GET /cook-sessions/current` → `CurrentCookSessionView | null`.
- Consumes: `Recipe`/`RecipeDocument` (new — `CookSessionsModule` gains a `Recipe` model dependency, following the same pattern `CookLogModule` already uses for its own `prepTime`/`cookTime` lookup).

- [ ] **Step 1: Write the failing tests**

Add to `api/src/cook-sessions/cook-sessions.service.spec.ts`. First, find the shared mock setup at the top of the file (the `redisClient`/`redisService`/`model` declarations) and add a `Recipe` model mock alongside them. Find:

```ts
  const cookLogService = { recordCook: jest.fn() }
```

(or wherever `CookLogService`'s mock is declared in the existing `providers` array for `makeService()`) and add a sibling declaration right after it:

```ts
  const recipeFindOne = jest.fn()
  const recipeModel = { findOne: recipeFindOne }
```

Find the `makeService()` helper's `providers` array and add the new provider:

```ts
        { provide: CookLogService, useValue: cookLogService },
```

becomes:

```ts
        { provide: CookLogService, useValue: cookLogService },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
```

Add the import for `Recipe` near the top of the file, alongside the existing `CookSession` import:

```ts
import { CookSession } from './schemas/cook-session.schema'
```

becomes:

```ts
import { CookSession } from './schemas/cook-session.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'
```

Then add these new test cases (append to the file, inside the existing `describe('CookSessionsService', ...)` block):

```ts
  it('startSession also writes a per-user "current cook" pointer with the recipe title', async () => {
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ title: 'Chicken Soup' }) })
    const service = await makeService()
    const sessionId = await service.startSession('user_1', 'recipe_a')
    expect(set).toHaveBeenCalledWith(
      'cook-session-current:user_1',
      JSON.stringify({ sessionId, recipeId: 'recipe_a', recipeTitle: 'Chicken Soup' }),
      'EX',
      86400,
    )
  })

  it('startSession falls back to an empty title if the recipe lookup finds nothing', async () => {
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService()
    const sessionId = await service.startSession('user_1', 'recipe_a')
    expect(set).toHaveBeenCalledWith(
      'cook-session-current:user_1',
      JSON.stringify({ sessionId, recipeId: 'recipe_a', recipeTitle: '' }),
      'EX',
      86400,
    )
  })

  it('getCurrentSession returns the pointer contents when one exists', async () => {
    get.mockResolvedValue(JSON.stringify({ sessionId: 'session_1', recipeId: 'recipe_a', recipeTitle: 'Chicken Soup' }))
    const service = await makeService()
    const result = await service.getCurrentSession('user_1')
    expect(get).toHaveBeenCalledWith('cook-session-current:user_1')
    expect(result).toEqual({ sessionId: 'session_1', recipeId: 'recipe_a', recipeTitle: 'Chicken Soup' })
  })

  it('getCurrentSession returns null when no pointer exists', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.getCurrentSession('user_1')).resolves.toBeNull()
  })

  it('finishSession deletes the current-cook pointer alongside the other Redis keys', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    create.mockResolvedValue({})
    const service = await makeService()
    await service.finishSession('session_1', 'user_1')
    expect(del).toHaveBeenCalledWith('cook-session-current:user_1')
  })

  it('abandonSession deletes the current-cook pointer alongside the other Redis keys', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.abandonSession('session_1', 'user_1')
    expect(del).toHaveBeenCalledWith('cook-session-current:user_1')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: FAIL — `getCurrentSession` not defined, `startSession` doesn't write the new key, `finishSession`/`abandonSession` don't delete it

- [ ] **Step 3: Implement the service changes**

In `api/src/cook-sessions/cook-sessions.service.ts`, add the imports:

```ts
import { RedisService } from '../redis/redis.service'
import { CookLogService } from '../cook-log/cook-log.service'
```

becomes:

```ts
import { RedisService } from '../redis/redis.service'
import { CookLogService } from '../cook-log/cook-log.service'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
```

Add a new exported interface and a new key-format helper right after the existing `activeIndexKey` function:

```ts
function activeIndexKey(userId: string, recipeId: string): string {
  return `cook-session-active:${userId}:${recipeId}`
}
```

becomes:

```ts
function activeIndexKey(userId: string, recipeId: string): string {
  return `cook-session-active:${userId}:${recipeId}`
}

// Points at whichever session the user is *currently* cooking, if any -
// unlike activeIndexKey (scoped to one recipe), this is scoped to the
// user alone, which is what makes it possible to detect a conflict when
// they try to start a DIFFERENT recipe while already cooking one.
function currentPointerKey(userId: string): string {
  return `cook-session-current:${userId}`
}
```

Add the new exported interface near the existing `ActiveCookSessionView`:

```ts
export interface ActiveCookSessionView {
  sessionId: string
  currentStepKey: string | null
  currentStepNum: number
  checkedSteps: string[]
  checkedIngredients: string[]
  startedAt: string
}
```

becomes:

```ts
export interface ActiveCookSessionView {
  sessionId: string
  currentStepKey: string | null
  currentStepNum: number
  checkedSteps: string[]
  checkedIngredients: string[]
  startedAt: string
}

export interface CurrentCookSessionView {
  sessionId: string
  recipeId: string
  recipeTitle: string
}
```

Add the `Recipe` model to the constructor:

```ts
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    private readonly redis: RedisService,
    private readonly cookLogService: CookLogService,
  ) {}
```

becomes:

```ts
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly redis: RedisService,
    private readonly cookLogService: CookLogService,
  ) {}
```

Update `startSession` to also write the pointer:

```ts
  async startSession(userId: string, recipeId: string): Promise<string> {
    const sessionId = randomUUID()
    const session: RedisSession = {
      userId,
      recipeId,
      startedAt: new Date().toISOString(),
      events: [],
      currentStepKey: null,
      currentStepNum: 0,
      checkedSteps: [],
      checkedIngredients: [],
    }
    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
    await client.set(activeIndexKey(userId, recipeId), sessionId, 'EX', SESSION_TTL_SECONDS)
    return sessionId
  }
```

Replace with:

```ts
  async startSession(userId: string, recipeId: string): Promise<string> {
    const sessionId = randomUUID()
    const session: RedisSession = {
      userId,
      recipeId,
      startedAt: new Date().toISOString(),
      events: [],
      currentStepKey: null,
      currentStepNum: 0,
      checkedSteps: [],
      checkedIngredients: [],
    }
    const recipe = await this.recipeModel.findOne({ _id: recipeId }).exec()
    const pointer: CurrentCookSessionView = { sessionId, recipeId, recipeTitle: recipe?.title ?? '' }

    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
    await client.set(activeIndexKey(userId, recipeId), sessionId, 'EX', SESSION_TTL_SECONDS)
    await client.set(currentPointerKey(userId), JSON.stringify(pointer), 'EX', SESSION_TTL_SECONDS)
    return sessionId
  }
```

Add the new `getCurrentSession` method right after `getActiveSession`:

```ts
  async getActiveSession(userId: string, recipeId: string): Promise<ActiveCookSessionView | null> {
    const sessionId = await this.redis.getClient().get(activeIndexKey(userId, recipeId))
    if (!sessionId) return null

    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return null

    return {
      sessionId,
      currentStepKey: session.currentStepKey,
      currentStepNum: session.currentStepNum,
      checkedSteps: session.checkedSteps,
      checkedIngredients: session.checkedIngredients,
      startedAt: session.startedAt,
    }
  }
```

becomes:

```ts
  async getActiveSession(userId: string, recipeId: string): Promise<ActiveCookSessionView | null> {
    const sessionId = await this.redis.getClient().get(activeIndexKey(userId, recipeId))
    if (!sessionId) return null

    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return null

    return {
      sessionId,
      currentStepKey: session.currentStepKey,
      currentStepNum: session.currentStepNum,
      checkedSteps: session.checkedSteps,
      checkedIngredients: session.checkedIngredients,
      startedAt: session.startedAt,
    }
  }

  async getCurrentSession(userId: string): Promise<CurrentCookSessionView | null> {
    const raw = await this.redis.getClient().get(currentPointerKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as CurrentCookSessionView
  }
```

Update `finishSession`'s cleanup block:

```ts
    const client = this.redis.getClient()
    await client.del(redisKey(sessionId))
    await client.del(activeIndexKey(session.userId, session.recipeId))
  }

  async abandonSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    const client = this.redis.getClient()
    await client.del(redisKey(sessionId))
    await client.del(activeIndexKey(session.userId, session.recipeId))
  }
```

Replace with:

```ts
    const client = this.redis.getClient()
    await client.del(redisKey(sessionId))
    await client.del(activeIndexKey(session.userId, session.recipeId))
    await client.del(currentPointerKey(session.userId))
  }

  async abandonSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    const client = this.redis.getClient()
    await client.del(redisKey(sessionId))
    await client.del(activeIndexKey(session.userId, session.recipeId))
    await client.del(currentPointerKey(session.userId))
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 5: Write the failing controller test**

Add to `api/src/cook-sessions/cook-sessions.controller.spec.ts`, add `getCurrentSession: jest.fn()` to the shared `cookSessionsService` mock object at the top of the file, then append:

```ts
  it('GET /cook-sessions/current returns the current session view for the authenticated user', async () => {
    const view = { sessionId: 'session_1', recipeId: 'recipe_a', recipeTitle: 'Chicken Soup' }
    cookSessionsService.getCurrentSession.mockResolvedValue(view)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getCurrent({ userId: 'user_1' } as any)
    expect(cookSessionsService.getCurrentSession).toHaveBeenCalledWith('user_1')
    expect(result).toEqual(view)
  })

  it('GET /cook-sessions/current returns null when there is no active session', async () => {
    cookSessionsService.getCurrentSession.mockResolvedValue(null)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getCurrent({ userId: 'user_1' } as any)
    expect(result).toBeNull()
  })
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd api && npx jest cook-sessions/cook-sessions.controller.spec.ts`
Expected: FAIL — `controller.getCurrent` is not a function

- [ ] **Step 7: Add the controller endpoint**

Find the `getActive` endpoint in `api/src/cook-sessions/cook-sessions.controller.ts`:

```ts
  @Get('active/:recipeId')
  async getActive(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getActiveSession(req.userId, recipeId)
  }
```

Add a new route right after it (before it in the file works too, but this ordering avoids the `active/:recipeId` route needing to be reasoned about relative to a static `current` segment - place `current` first so a literal path segment is matched before any dynamic one, though NestJS's router doesn't actually care about declaration order for distinct literal vs param segments; keep this ordering for readability):

```ts
  @Get('active/:recipeId')
  async getActive(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getActiveSession(req.userId, recipeId)
  }

  @Get('current')
  async getCurrent(@Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getCurrentSession(req.userId)
  }
```

- [ ] **Step 8: Run the controller test to verify it passes**

Run: `cd api && npx jest cook-sessions/cook-sessions.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Wire the `Recipe` model into `CookSessionsModule`**

Find `api/src/cook-sessions/cook-sessions.module.ts`:

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

Replace with:

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from './schemas/cook-session.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { CookSessionsService } from './cook-sessions.service'
import { CookSessionsController } from './cook-sessions.controller'
import { CookLogModule } from '../cook-log/cook-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookSession.name, schema: CookSessionSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    CookLogModule,
  ],
  providers: [CookSessionsService],
  controllers: [CookSessionsController],
})
export class CookSessionsModule {}
```

- [ ] **Step 10: Fix the pre-existing empty catch block in `finishSession` (incidental cleanup, same file)**

While in this file, find the defensive `recordCook` guard flagged in a prior review as silently swallowing without logging:

```ts
    try {
      await this.cookLogService.recordCook(session.userId, session.recipeId)
    } catch (err) {
      // recordCook never throws itself, but guard defensively - a failure
      // here must never prevent Redis cleanup
    }
```

Replace with (add a `Logger` import and field if the class doesn't already have one - check the top of the file first):

```ts
    try {
      await this.cookLogService.recordCook(session.userId, session.recipeId)
    } catch (err) {
      // recordCook never throws itself, but guard defensively - a failure
      // here must never prevent Redis cleanup.
      this.logger.error(
        `recordCook threw unexpectedly for user ${session.userId} on recipe ${session.recipeId}`,
        err instanceof Error ? err.stack : err,
      )
    }
```

If `CookSessionsService` doesn't yet have a `logger` field, add one (matching the pattern already used in `CookLogService` from an earlier phase): add `Logger` to the `@nestjs/common` import at the top of the file, and add `private readonly logger = new Logger(CookSessionsService.name)` as the first line inside the class body, before the constructor.

- [ ] **Step 11: Run the full API test suite**

Run: `cd api && npm test`
Expected: PASS, no regressions

- [ ] **Step 12: Commit**

```bash
git add api/src/cook-sessions
git commit -m "$(cat <<'EOF'
feat: add per-user "current cook" pointer for cook-conflict detection

Phase F of the cook-mode redesign - a new cook-session-current:{userId}
Redis pointer (set on start, deleted on finish/abandon, alongside the
existing per-session and per-recipe-index keys) plus a new
GET /cook-sessions/current endpoint, so a recipe page can discover
whether the signed-in user is already cooking something else before
starting a new session. startSession now also looks up the recipe's
title (mirroring CookLogService's existing Recipe-model dependency)
so the pointer carries what a conflict-warning popup needs without a
second round trip.

Also adds logging to a previously-silent defensive catch block in
finishSession, flagged in Phase E's final review.

docs/superpowers/specs/2026-08-14-cook-conflict-warning-design.md
EOF
)"
```

---

## Task 2: Frontend — conflict popup + disabled "Cooking..." button

**Files:**
- Modify: `src/lib/cookSessions.ts`
- Modify: `src/i18n.ts`
- Modify: `src/components/RecipeDetail.tsx`

**Interfaces:**
- Consumes (from Task 1, via HTTP): `GET /cook-sessions/current` → `{ sessionId: string; recipeId: string; recipeTitle: string } | null`.
- Produces: `src/lib/cookSessions.ts` exports `getCurrentCookSession(getToken: () => Promise<string | null>): Promise<{ sessionId: string; recipeId: string; recipeTitle: string } | null>`.

- [ ] **Step 1: Add the frontend API wrapper**

Append to `src/lib/cookSessions.ts` (after the existing `getActiveCookSession` function):

```ts

export interface CurrentCookSession {
  sessionId: string
  recipeId: string
  recipeTitle: string
}

export async function getCurrentCookSession(
  getToken: () => Promise<string | null>
): Promise<CurrentCookSession | null> {
  try {
    const token = await getToken()
    const res = await fetch('/api/cook-sessions/current', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return null
    return (await res.json()) as CurrentCookSession | null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add new i18n keys**

In `src/i18n.ts`, find the `he` block's `startCooking` entry:

```ts
      startCooking: "התחילו לבשל",
```

Add right after it:

```ts
      startCooking: "התחילו לבשל",
      cooking: "מבשל...",
      alreadyCookingElsewhere: "כבר מבשלים משהו אחר",
      cookingElsewhereWarning: (recipeTitle: string) =>
        `אתם כבר מבשלים את "${recipeTitle}". התחלת בישול חדש תבטל את הבישול הקודם באמצע.`,
      startNewCook: "התחל בישול חדש",
```

Find the `en` block's `startCooking` entry:

```ts
      startCooking: "Start cooking",
```

Add right after it:

```ts
      startCooking: "Start cooking",
      cooking: "Cooking...",
      alreadyCookingElsewhere: "Already cooking something else",
      cookingElsewhereWarning: (recipeTitle: string) =>
        `You're already cooking "${recipeTitle}". Starting a new cook will abandon that one unfinished.`,
      startNewCook: "Start new cook",
```

- [ ] **Step 3: Wire the conflict check and popup into `RecipeDetail.tsx`**

Add the import near the other `../lib/cookSessions` import:

```ts
import {
  startCookSession, logCookSessionStep, finishCookSession, abandonCookSession,
  getActiveCookSession, syncCookSession,
} from '../lib/cookSessions'
```

becomes:

```ts
import {
  startCookSession, logCookSessionStep, finishCookSession, abandonCookSession,
  getActiveCookSession, syncCookSession, getCurrentCookSession,
} from '../lib/cookSessions'
```

Add new state near the other `cookSession*` state declarations (find `const [startDockExpanded, setStartDockExpanded] = useState(false)`):

```ts
  const [startDockExpanded, setStartDockExpanded] = useState(false)
```

becomes:

```ts
  const [startDockExpanded, setStartDockExpanded] = useState(false)
  const [cookConflict, setCookConflict] = useState<{ sessionId: string; recipeTitle: string } | null>(null)
  const [resolvingCookConflict, setResolvingCookConflict] = useState(false)
```

Find `openWizard()`'s opening guard:

```tsx
  function openWizard() {
    if (cookSessionActive) return
```

Replace with:

```tsx
  function openWizard() {
    if (cookSessionActive) return
    void startCookingWithConflictCheck()
  }

  async function startCookingWithConflictCheck() {
    if (currentUserId) {
      const current = await getCurrentCookSession(getToken)
      if (current && current.recipeId !== id) {
        setCookConflict({ sessionId: current.sessionId, recipeTitle: current.recipeTitle })
        return
      }
    }
    startCookingNow()
  }

  function startCookingNow() {
```

(This splits the old `openWizard()` body into a guard-only `openWizard()`, a new `startCookingWithConflictCheck()` that checks for a conflict before proceeding, and `startCookingNow()`, which is everything `openWizard()` used to do after its guard - the next step moves that body.)

The rest of `openWizard()`'s old body (everything from `const firstUnchecked = ...` through the closing `}` of the function) now needs to live inside `startCookingNow()` instead. Find:

```tsx
  function startCookingNow() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    const startIndex = firstUnchecked === -1 ? 0 : firstUnchecked
    setWizardIndex(startIndex)
    setCookSessionActive(true)
    setStartDockExpanded(true)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
    pendingCookStepRef.current = null
    lastEnteredStepRef.current = { stepKey: 'checklist', stepNum: 0 }
    if (currentUserId && recipe) {
      startCookSession(recipe.id, getToken).then(id => {
        setCookSessionId(id)
        if (!id) return
        // Mirrors CookDock's own screen-selection logic: if every
        // ingredient is already checked, the dock mounts directly on the
        // "steps" screen and (by design) never calls onStepEntered for
        // that initial step on mount - log it here instead so a fresh
        // session that skips the checklist doesn't silently miss step 1
        // in its timeline.
        const allIngredientsChecked = (displayRecipe?.ingredients ?? []).every((group, gi) =>
          group.items.every((_, ii) => checkedIngredients.has(`${gi}-${ii}`))
        )
        const initialStep = flatSteps[startIndex]
        if (allIngredientsChecked && initialStep) {
          const stepKey = `${initialStep.groupIdx}-${initialStep.stepIdx}`
          lastEnteredStepRef.current = { stepKey, stepNum: initialStep.stepNum }
          logCookSessionStep(id, stepKey, initialStep.stepNum, [...checkedSteps], [...checkedIngredients], getToken)
        } else if (pendingCookStepRef.current) {
          const { stepKey, stepNum } = pendingCookStepRef.current
          pendingCookStepRef.current = null
          logCookSessionStep(id, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
        }
      })
    }
  }
```

(i.e. this is the note: after Step 3's split, `startCookingNow()`'s body is exactly the OLD `openWizard()`'s body with `function openWizard() { if (cookSessionActive) return` removed from the top and the function name changed - if your edit tool applied Step 3's replacement literally, this content should already be in place verbatim except for the function signature line; verify it matches the block shown here exactly before moving on, since this is the most error-prone edit in this task.)

Add the conflict-resolution handler right after `startCookingNow()`:

```tsx
  async function confirmStartNewCook() {
    if (!cookConflict) return
    setResolvingCookConflict(true)
    await abandonCookSession(cookConflict.sessionId, getToken)
    setResolvingCookConflict(false)
    setCookConflict(null)
    startCookingNow()
  }
```

- [ ] **Step 4: Update the "Start cooking" button and add the `ConfirmDialog`**

Find the button:

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

Replace with:

```tsx
            {isViewingPublishedContent && (
              <button type="button"
                disabled={cookSessionActive}
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  openWizard()
                }}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">🍳</span>
                {cookSessionActive ? tx.cooking : tx.startCooking}
              </button>
            )}
```

Find the two existing `<ConfirmDialog .../>` elements near the end of the component's JSX (right before the component's closing `</div>` and `)`/`}`):

```tsx
      <ConfirmDialog
        open={publishConfirmOpen}
        title={tx.publishRecipe}
        message={tx.publishThisRecipeForAIReview}
        confirmLabel={tx.publish}
        cancelLabel={tx.cancel}
        busy={submitting}
        onConfirm={() => { setPublishConfirmOpen(false); handleSubmitForReview() }}
        onCancel={() => setPublishConfirmOpen(false)}
      />
    </div>
  )
}
```

Replace with:

```tsx
      <ConfirmDialog
        open={publishConfirmOpen}
        title={tx.publishRecipe}
        message={tx.publishThisRecipeForAIReview}
        confirmLabel={tx.publish}
        cancelLabel={tx.cancel}
        busy={submitting}
        onConfirm={() => { setPublishConfirmOpen(false); handleSubmitForReview() }}
        onCancel={() => setPublishConfirmOpen(false)}
      />

      <ConfirmDialog
        open={!!cookConflict}
        title={tx.alreadyCookingElsewhere}
        message={cookConflict ? tx.cookingElsewhereWarning(cookConflict.recipeTitle) : ''}
        confirmLabel={tx.startNewCook}
        cancelLabel={tx.cancel}
        busy={resolvingCookConflict}
        onConfirm={confirmStartNewCook}
        onCancel={() => setCookConflict(null)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/lib/cookSessions.ts src/i18n.ts src/components/RecipeDetail.tsx
```

Expected: no errors, no unexpected warnings.

- [ ] **Step 6: Manual verification**

With the backend running and two recipes available to a signed-in user: start cooking recipe A, confirm its "Start cooking" button becomes disabled and reads "Cooking..." (no popup on this recipe, since it's the one active). Navigate to a different recipe B and click its "Start cooking" - confirm a popup appears naming recipe A, with "Start new cook" and "Cancel" options. Clicking "Cancel" leaves A's session untouched and B never starts. Clicking "Start new cook" abandons A's session (confirm via a fresh page load of A that no session resumes there) and starts B normally. This step can't be run by an agentic implementer without live infra and a signed-in session - note in the report if it wasn't possible, that's expected; Step 5's build/lint checks are the verifiable bar.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cookSessions.ts src/i18n.ts src/components/RecipeDetail.tsx
git commit -m "$(cat <<'EOF'
feat: warn before abandoning an in-progress cook on another recipe

Phase F frontend half: clicking "Start cooking" on a recipe the user
isn't currently cooking now first checks (lazily, only on click) 
whether they have an active session elsewhere via the new
GET /cook-sessions/current endpoint. If so, a confirmation popup
names the other recipe and warns that starting a new cook will
abandon it unfinished - confirming calls the existing
abandonCookSession before proceeding as normal. On the recipe
actually being cooked, "Start cooking" is now disabled and reads
"Cooking..." instead of staying silently clickable-but-inert.

docs/superpowers/specs/2026-08-14-cook-conflict-warning-design.md
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Per-user pointer with recipeTitle, same TTL semantics ✓ Task 1 Step 3. `startSession` looks up title via `Recipe` model ✓ same step. `GET /cook-sessions/current` returns pointer or `null` at 200, auth-scoped ✓ Task 1 Steps 7/9. Lazy-only-on-click check ✓ Task 2 Step 3 (`startCookingWithConflictCheck` called from the button's `openWizard()`, never from a page-load effect). Popup only on genuinely different recipe ✓ Task 2 Step 3 (`current.recipeId !== id`). Confirm abandons old then starts new ✓ Task 2 Step 3 (`confirmStartNewCook`). Disabled button + "Cooking..." label ✓ Task 2 Step 4. Reuses existing `ConfirmDialog` in the same pattern as the file's other two usages ✓ Task 2 Step 4. Best-effort/never-blocks on failure ✓ `getCurrentCookSession`'s try/catch (Task 2 Step 1) mirrors every other function in that file.
- **Placeholder scan:** No TBD/TODO; every code block is complete, including the full test additions.
- **Type consistency:** `CurrentCookSessionView` (backend, Task 1) and `CurrentCookSession` (frontend, Task 2 Step 1) have identical field names/types (`sessionId: string`, `recipeId: string`, `recipeTitle: string`). `getCurrentSession`'s signature matches exactly between the service, its tests, and the controller. `cookConflict` state's shape (`{ sessionId, recipeTitle }`) matches what `startCookingWithConflictCheck` extracts from the fetched `CurrentCookSession`.
