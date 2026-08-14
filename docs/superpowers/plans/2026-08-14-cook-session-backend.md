# Cook Mode Redesign — Phase C: Cook Session Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a cook session's step-by-step timeline live in Redis while it's in progress; permanently persist it to Mongo only when the user finishes.

**Architecture:** A new NestJS `cook-sessions/` module (schema + service + controller + module, structured like the existing `cook-log/` module) owns both the live Redis representation and the permanent Mongo `CookSession` collection — deliberately separate from `ActivityLogModule`. The frontend gets a new `src/lib/cookSessions.ts` with four fire-and-forget fetch wrappers; `RecipeDetail.tsx` owns the `sessionId` and calls start/finish/abandon at the existing session-lifecycle points; `CookDock.tsx` gains one new callback prop (`onStepEntered`) fired on every screen/step transition, keeping `CookDock` itself free of network/auth concerns (it already only calls up to callbacks `RecipeDetail` owns, per Phase B's design).

**Tech Stack:** NestJS, Mongoose, ioredis (already wired in `api/src/redis/`), React/Vite, Clerk (`@clerk/react`'s `useAuth()`). No new dependencies — session IDs use Node's built-in `crypto.randomUUID()`.

## Global Constraints

- New module `api/src/cook-sessions/` does NOT import or use `ActivityLogModule` — this is a separate system from admin feature-usage analytics.
- All four new endpoints require auth via the existing global `ClerkAuthGuard` (no `@Public()` decorator) — `req.userId` is available in every handler.
- Redis key: `cook-session:{sessionId}` (server-generated `crypto.randomUUID()`, not fixed per-user). Value is JSON: `{ userId, recipeId, startedAt, events: [{ stepKey, stepNum, enteredAt }] }`. Every write resets `EXPIRE` to 86400 seconds (24h) from that write.
- `stepKey` format: `${groupIdx}-${stepIdx}` for real steps (matching `CookDock.tsx`'s existing `checkedSteps` key format exactly), or the literal string `"checklist"` for the ingredient-checklist screen (`stepNum: 0`).
- All server-side timestamps — never trust a client-supplied time.
- Mongo `CookSession` collection (new, separate from `CookLog`): `{ userId, recipeId, startedAt, finishedAt, totalDurationSeconds, steps: [{ stepKey, stepNum, enteredAt, durationSeconds }] }`. The `"checklist"` pseudo-step is excluded from the persisted `steps` array (unmeasured, per Phase B).
- `finish`/`abandon` (DELETE) on a missing/expired Redis key must return success (`{ ok: true }`), never an error.
- Every frontend call to these endpoints is fire-and-forget: caught, swallowed, never retried, never blocks or visibly disrupts cooking. `CookDock`'s existing client-side stopwatch/step state (Phase B) remains the source of truth the user sees regardless of whether these calls succeed.
- Session tracking applies only to signed-in users (`currentUserId` truthy) — anonymous cooking is unaffected, exactly as it behaves today.
- No new npm dependencies in either `api/` or the root frontend package.

---

## Task 1: Backend `cook-sessions` module

**Files:**
- Create: `api/src/cook-sessions/schemas/cook-session.schema.ts`
- Create: `api/src/cook-sessions/cook-sessions.service.ts`
- Create: `api/src/cook-sessions/cook-sessions.controller.ts`
- Create: `api/src/cook-sessions/cook-sessions.module.ts`
- Test: `api/src/cook-sessions/cook-sessions.service.spec.ts`
- Test: `api/src/cook-sessions/cook-sessions.controller.spec.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Produces: `CookSessionsService.startSession(userId: string, recipeId: string): Promise<string>` (returns the new `sessionId`), `CookSessionsService.logStep(sessionId: string, stepKey: string, stepNum: number): Promise<void>`, `CookSessionsService.finishSession(sessionId: string): Promise<void>`, `CookSessionsService.abandonSession(sessionId: string): Promise<void>`.
- Produces (HTTP, consumed by Task 2's frontend code): `POST /cook-sessions/:recipeId` → `{ sessionId: string }`; `POST /cook-sessions/:sessionId/steps` body `{ stepKey: string; stepNum: number }` → `{ ok: true }`; `POST /cook-sessions/:sessionId/finish` → `{ ok: true }`; `DELETE /cook-sessions/:sessionId` → `{ ok: true }`.
- Consumes: `RedisService` (`api/src/redis/redis.service.ts`, already exists, exported by the `@Global()` `RedisModule` so no explicit import needed in `CookSessionsModule`) via `redisService.getClient()` returning an `ioredis` `Redis` instance with `.get(key)`, `.set(key, value)`, `.expire(key, seconds)`, `.del(key)`.

- [ ] **Step 1: Write the Mongo schema**

```ts
// api/src/cook-sessions/schemas/cook-session.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CookSessionDocument = CookSession & Document

@Schema({ _id: false })
export class CookSessionStep {
  @Prop({ required: true })
  stepKey!: string

  @Prop({ required: true })
  stepNum!: number

  @Prop({ required: true })
  enteredAt!: Date

  @Prop({ required: true })
  durationSeconds!: number
}

export const CookSessionStepSchema = SchemaFactory.createForClass(CookSessionStep)

@Schema({ timestamps: true })
export class CookSession {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true })
  startedAt!: Date

  @Prop({ required: true })
  finishedAt!: Date

  @Prop({ required: true })
  totalDurationSeconds!: number

  @Prop({ type: [CookSessionStepSchema], required: true })
  steps!: CookSessionStep[]
}

export const CookSessionSchema = SchemaFactory.createForClass(CookSession)
```

- [ ] **Step 2: Write the service's failing tests**

```ts
// api/src/cook-sessions/cook-sessions.service.spec.ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookSessionsService } from './cook-sessions.service'
import { CookSession } from './schemas/cook-session.schema'
import { RedisService } from '../redis/redis.service'

describe('CookSessionsService', () => {
  const get = jest.fn()
  const set = jest.fn()
  const expire = jest.fn()
  const del = jest.fn()
  const redisClient = { get, set, expire, del }
  const redisService = { getClient: () => redisClient }
  const create = jest.fn()
  const model = { create }

  beforeEach(() => jest.clearAllMocks())

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

  it('startSession writes a new Redis entry with empty events and returns a sessionId', async () => {
    const service = await makeService()
    const sessionId = await service.startSession('user_1', 'recipe_a')
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
    expect(set).toHaveBeenCalledWith(
      `cook-session:${sessionId}`,
      expect.stringContaining('"userId":"user_1"')
    )
    expect(expire).toHaveBeenCalledWith(`cook-session:${sessionId}`, 86400)
  })

  it('logStep appends an event to the existing Redis entry and refreshes the TTL', async () => {
    const existing = {
      userId: 'user_1',
      recipeId: 'recipe_a',
      startedAt: '2026-08-14T10:00:00.000Z',
      events: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.logStep('session_1', '0-0', 1)

    expect(set).toHaveBeenCalledWith(
      'cook-session:session_1',
      expect.stringContaining('"stepKey":"0-0"')
    )
    expect(expire).toHaveBeenCalledWith('cook-session:session_1', 86400)
  })

  it('logStep on a missing Redis key silently no-ops', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.logStep('gone', '0-0', 1)).resolves.toBeUndefined()
    expect(set).not.toHaveBeenCalled()
  })

  it('finishSession computes per-step durations, writes the Mongo doc, and deletes the Redis key', async () => {
    const existing = {
      userId: 'user_1',
      recipeId: 'recipe_a',
      startedAt: '2026-08-14T10:00:00.000Z',
      events: [
        { stepKey: 'checklist', stepNum: 0, enteredAt: '2026-08-14T10:00:00.000Z' },
        { stepKey: '0-0', stepNum: 1, enteredAt: '2026-08-14T10:00:30.000Z' },
        { stepKey: '0-1', stepNum: 2, enteredAt: '2026-08-14T10:02:00.000Z' },
      ],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    create.mockResolvedValue({})
    const service = await makeService()

    const realDateNow = Date.now
    Date.now = () => new Date('2026-08-14T10:03:00.000Z').getTime()
    try {
      await service.finishSession('session_1')
    } finally {
      Date.now = realDateNow
    }

    expect(create).toHaveBeenCalledWith({
      userId: 'user_1',
      recipeId: 'recipe_a',
      startedAt: new Date('2026-08-14T10:00:00.000Z'),
      finishedAt: new Date('2026-08-14T10:03:00.000Z'),
      totalDurationSeconds: 180,
      steps: [
        { stepKey: '0-0', stepNum: 1, enteredAt: new Date('2026-08-14T10:00:30.000Z'), durationSeconds: 90 },
        { stepKey: '0-1', stepNum: 2, enteredAt: new Date('2026-08-14T10:02:00.000Z'), durationSeconds: 60 },
      ],
    })
    expect(del).toHaveBeenCalledWith('cook-session:session_1')
  })

  it('finishSession on a missing Redis key silently no-ops without writing to Mongo', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.finishSession('gone')).resolves.toBeUndefined()
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('abandonSession deletes the Redis key', async () => {
    const service = await makeService()
    await service.abandonSession('session_1')
    expect(del).toHaveBeenCalledWith('cook-session:session_1')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: FAIL — `Cannot find module './cook-sessions.service'`

- [ ] **Step 4: Implement the service**

```ts
// api/src/cook-sessions/cook-sessions.service.ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { randomUUID } from 'crypto'
import { CookSession, CookSessionDocument } from './schemas/cook-session.schema'
import { RedisService } from '../redis/redis.service'

const SESSION_TTL_SECONDS = 86400

interface RedisEvent {
  stepKey: string
  stepNum: number
  enteredAt: string
}

interface RedisSession {
  userId: string
  recipeId: string
  startedAt: string
  events: RedisEvent[]
}

function redisKey(sessionId: string): string {
  return `cook-session:${sessionId}`
}

@Injectable()
export class CookSessionsService {
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    private readonly redis: RedisService,
  ) {}

  async startSession(userId: string, recipeId: string): Promise<string> {
    const sessionId = randomUUID()
    const session: RedisSession = {
      userId,
      recipeId,
      startedAt: new Date().toISOString(),
      events: [],
    }
    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session))
    await client.expire(redisKey(sessionId), SESSION_TTL_SECONDS)
    return sessionId
  }

  private async readSession(sessionId: string): Promise<RedisSession | null> {
    const raw = await this.redis.getClient().get(redisKey(sessionId))
    if (!raw) return null
    return JSON.parse(raw) as RedisSession
  }

  async logStep(sessionId: string, stepKey: string, stepNum: number): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session) return

    session.events.push({ stepKey, stepNum, enteredAt: new Date().toISOString() })
    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session))
    await client.expire(redisKey(sessionId), SESSION_TTL_SECONDS)
  }

  async finishSession(sessionId: string): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session) return

    const finishedAt = new Date()
    const realSteps = session.events.filter(e => e.stepKey !== 'checklist')
    const steps = realSteps.map((event, i) => {
      const nextEnteredAt = i + 1 < realSteps.length
        ? new Date(realSteps[i + 1].enteredAt)
        : finishedAt
      const enteredAt = new Date(event.enteredAt)
      return {
        stepKey: event.stepKey,
        stepNum: event.stepNum,
        enteredAt,
        durationSeconds: Math.round((nextEnteredAt.getTime() - enteredAt.getTime()) / 1000),
      }
    })

    const startedAt = new Date(session.startedAt)
    await this.cookSessionModel.create({
      userId: session.userId,
      recipeId: session.recipeId,
      startedAt,
      finishedAt,
      totalDurationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
      steps,
    })

    await this.redis.getClient().del(redisKey(sessionId))
  }

  async abandonSession(sessionId: string): Promise<void> {
    await this.redis.getClient().del(redisKey(sessionId))
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Write the controller's failing tests**

```ts
// api/src/cook-sessions/cook-sessions.controller.spec.ts
import { CookSessionsController } from './cook-sessions.controller'

describe('CookSessionsController', () => {
  const cookSessionsService = {
    startSession: jest.fn(),
    logStep: jest.fn(),
    finishSession: jest.fn(),
    abandonSession: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('POST /cook-sessions/:recipeId starts a session for the authenticated user', async () => {
    cookSessionsService.startSession.mockResolvedValue('session_1')
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.start('recipe_a', { userId: 'user_1' } as any)
    expect(cookSessionsService.startSession).toHaveBeenCalledWith('user_1', 'recipe_a')
    expect(result).toEqual({ sessionId: 'session_1' })
  })

  it('POST /cook-sessions/:sessionId/steps logs a step', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.logStep('session_1', { stepKey: '0-0', stepNum: 1 })
    expect(cookSessionsService.logStep).toHaveBeenCalledWith('session_1', '0-0', 1)
    expect(result).toEqual({ ok: true })
  })

  it('POST /cook-sessions/:sessionId/finish finishes a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.finish('session_1')
    expect(cookSessionsService.finishSession).toHaveBeenCalledWith('session_1')
    expect(result).toEqual({ ok: true })
  })

  it('DELETE /cook-sessions/:sessionId abandons a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.abandon('session_1')
    expect(cookSessionsService.abandonSession).toHaveBeenCalledWith('session_1')
    expect(result).toEqual({ ok: true })
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd api && npx jest cook-sessions/cook-sessions.controller.spec.ts`
Expected: FAIL — `Cannot find module './cook-sessions.controller'`

- [ ] **Step 8: Implement the controller**

```ts
// api/src/cook-sessions/cook-sessions.controller.ts
import { Body, Controller, Delete, Param, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookSessionsService } from './cook-sessions.service'

interface LogStepBody {
  stepKey: string
  stepNum: number
}

@Controller('cook-sessions')
export class CookSessionsController {
  constructor(private readonly cookSessionsService: CookSessionsService) {}

  @Post(':recipeId')
  async start(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    const sessionId = await this.cookSessionsService.startSession(req.userId, recipeId)
    return { sessionId }
  }

  @Post(':sessionId/steps')
  async logStep(@Param('sessionId') sessionId: string, @Body() body: LogStepBody) {
    await this.cookSessionsService.logStep(sessionId, body.stepKey, body.stepNum)
    return { ok: true }
  }

  @Post(':sessionId/finish')
  async finish(@Param('sessionId') sessionId: string) {
    await this.cookSessionsService.finishSession(sessionId)
    return { ok: true }
  }

  @Delete(':sessionId')
  async abandon(@Param('sessionId') sessionId: string) {
    await this.cookSessionsService.abandonSession(sessionId)
    return { ok: true }
  }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd api && npx jest cook-sessions/cook-sessions.controller.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Write the module and register it**

```ts
// api/src/cook-sessions/cook-sessions.module.ts
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

In `api/src/app.module.ts`, add the import alongside the other feature modules:

```ts
import { CookLogModule } from './cook-log/cook-log.module'
```

becomes:

```ts
import { CookLogModule } from './cook-log/cook-log.module'
import { CookSessionsModule } from './cook-sessions/cook-sessions.module'
```

and in the `imports` array, add `CookSessionsModule` right after `CookLogModule`:

```ts
    CookLogModule,
    CookSessionsModule,
    MealPlanModule,
```

- [ ] **Step 11: Run the full API test suite**

Run: `cd api && npm test`
Expected: PASS, no regressions, cook-sessions tests included (11 new tests total)

- [ ] **Step 12: Commit**

```bash
git add api/src/cook-sessions api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat: add cook-sessions backend module (Redis live log, Mongo on finish)

Phase C of the cook-mode redesign - logs a cook session's per-step
timeline live in Redis while in progress, persisting it permanently
to a new CookSession Mongo collection only when the user finishes.
Deliberately separate from ActivityLogModule (admin feature-usage
analytics) per design. Foundation for later phases (cross-device
resume, cooked-counter, cook-conflict warning, post-cook nudge,
history UI) - none of those are built yet.

docs/superpowers/specs/2026-08-14-cook-session-backend-design.md
EOF
)"
```

---

## Task 2: Frontend wiring

**Files:**
- Create: `src/lib/cookSessions.ts`
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/components/CookDock.tsx`

**Interfaces:**
- Consumes (from Task 1, via HTTP): `POST /cook-sessions/:recipeId` → `{ sessionId: string }`; `POST /cook-sessions/:sessionId/steps` body `{ stepKey, stepNum }`; `POST /cook-sessions/:sessionId/finish`; `DELETE /cook-sessions/:sessionId`.
- Produces: `src/lib/cookSessions.ts` exports `startCookSession(recipeId: string, getToken: () => Promise<string | null>): Promise<string | null>`, `logCookSessionStep(sessionId: string, stepKey: string, stepNum: number, getToken: () => Promise<string | null>): Promise<void>`, `finishCookSession(sessionId: string, getToken: () => Promise<string | null>): Promise<void>`, `abandonCookSession(sessionId: string, getToken: () => Promise<string | null>): Promise<void>`. `CookDockProps` gains `onStepEntered: (stepKey: string, stepNum: number) => void`.

- [ ] **Step 1: Create the frontend API wrapper**

```ts
// src/lib/cookSessions.ts

// All four calls are fire-and-forget by design (Phase C spec): a dropped
// network request mid-cook must never block or visibly disrupt cooking.
// CookDock's own client-side stopwatch/step state stays authoritative for
// what the user sees regardless of whether these succeed.

export async function startCookSession(
  recipeId: string,
  getToken: () => Promise<string | null>
): Promise<string | null> {
  try {
    const token = await getToken()
    const res = await fetch(`/api/cook-sessions/${recipeId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return null
    const data: { sessionId: string } = await res.json()
    return data.sessionId
  } catch {
    return null
  }
}

export async function logCookSessionStep(
  sessionId: string,
  stepKey: string,
  stepNum: number,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}/steps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ stepKey, stepNum }),
    })
  } catch {
    // best-effort, never blocks cooking
  }
}

export async function finishCookSession(
  sessionId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}/finish`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // best-effort, never blocks cooking
  }
}

export async function abandonCookSession(
  sessionId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // best-effort, never blocks cooking
  }
}
```

- [ ] **Step 2: Wire session lifecycle into `RecipeDetail.tsx`**

Add the import near the other `src/lib/*` imports:

```ts
import { startCookSession, logCookSessionStep, finishCookSession, abandonCookSession } from '../lib/cookSessions'
```

Add new state right next to the existing `cookSessionActive` declaration (`src/components/RecipeDetail.tsx:61`):

```tsx
  const [cookSessionActive, setCookSessionActive] = useState(false)
```

becomes:

```tsx
  const [cookSessionActive, setCookSessionActive] = useState(false)
  // Backend cook-session id for the in-progress session (Phase C) - null
  // whenever there's no session, the user is signed out, or the start
  // call hasn't resolved/failed silently. Every call site below already
  // treats a null id as "skip the network call", so anonymous cooking is
  // unaffected.
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
```

Find `openWizard()` (`src/components/RecipeDetail.tsx:725-729`):

```tsx
  function openWizard() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
    setCookSessionActive(true)
  }
```

Replace with:

```tsx
  function openWizard() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
    setCookSessionActive(true)
    setCookSessionId(null)
    if (currentUserId && recipe) {
      startCookSession(recipe.id, getToken).then(setCookSessionId)
    }
  }
```

Find `advanceWizardOrFinish()` (`src/components/RecipeDetail.tsx:640-646`):

```tsx
  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      setCookSessionActive(false)
    } else {
      setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
    }
  }
```

Replace with:

```tsx
  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      if (cookSessionId) {
        finishCookSession(cookSessionId, getToken)
        setCookSessionId(null)
      }
      setCookSessionActive(false)
    } else {
      setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
    }
  }
```

Find `stopCooking()` (`src/components/RecipeDetail.tsx:745-748`):

```tsx
  function stopCooking() {
    setCookSessionActive(false)
    backgroundCookStatusRef.current?.exitFloatingView()
  }
```

Replace with:

```tsx
  function stopCooking() {
    if (cookSessionId) {
      abandonCookSession(cookSessionId, getToken)
      setCookSessionId(null)
    }
    setCookSessionActive(false)
    backgroundCookStatusRef.current?.exitFloatingView()
  }
```

Add a new handler right after `stopCooking()`:

```tsx
  function handleStepEntered(stepKey: string, stepNum: number) {
    if (!cookSessionId) return
    logCookSessionStep(cookSessionId, stepKey, stepNum, getToken)
  }
```

Find the `<CookDock .../>` render call (`src/components/RecipeDetail.tsx:2029-2050`) and add the new prop right after `onStop={stopCooking}`:

```tsx
          onStop={stopCooking}
```

becomes:

```tsx
          onStop={stopCooking}
          onStepEntered={handleStepEntered}
```

- [ ] **Step 3: Wire step-transition logging into `CookDock.tsx`**

Add `onStepEntered` to `CookDockProps` (`src/components/CookDock.tsx:22-43`), right after `onStop`:

```tsx
  onStop: () => void
```

becomes:

```tsx
  onStop: () => void
  onStepEntered: (stepKey: string, stepNum: number) => void
```

Add `onStepEntered` to the destructured props (`src/components/CookDock.tsx:72-77`), right after `onStop`:

```tsx
  steps, wizardIndex, onPrev, onAdvance, onMarkDone, onStop, onExpand,
```

becomes:

```tsx
  steps, wizardIndex, onPrev, onAdvance, onMarkDone, onStop, onStepEntered, onExpand,
```

Add a new effect right after the `screen` state declaration (`src/components/CookDock.tsx:82-84`):

```tsx
  const [screen, setScreen] = useState<'checklist' | 'steps'>(() =>
    allIngredientKeys.some(k => !checkedIngredients.has(k)) ? 'checklist' : 'steps'
  )
```

becomes:

```tsx
  const [screen, setScreen] = useState<'checklist' | 'steps'>(() =>
    allIngredientKeys.some(k => !checkedIngredients.has(k)) ? 'checklist' : 'steps'
  )

  // Logs every screen/step transition to the backend cook-session (Phase
  // C) - a fire-and-forget recording layer the frontend never reads back
  // from. Fires once per transition, including the initial mount.
  useEffect(() => {
    if (screen === 'checklist') {
      onStepEntered('checklist', 0)
      return
    }
    const current = steps[wizardIndex]
    if (current) onStepEntered(`${current.groupIdx}-${current.stepIdx}`, current.stepNum)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStepEntered/steps are new references every render; only an actual screen/step change should re-fire this
  }, [screen, wizardIndex])
```

- [ ] **Step 4: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/lib/cookSessions.ts src/components/CookDock.tsx src/components/RecipeDetail.tsx
```

Expected: no errors, no unexpected warnings (the one `react-hooks/exhaustive-deps` disable added above is intentional and documented, matching the existing pattern a few lines away in the same file).

- [ ] **Step 5: Manual verification**

With the backend running locally (or against the deployed API) and a signed-in browser session: start cooking a recipe, confirm no console errors from the new fetch calls, advance through a couple of steps and finish the recipe, then check (via `mongosh` or the Metabase Mongo connection, per this repo's existing conventions) that a `cookSessions` collection document was created with the expected `steps` array and `totalDurationSeconds`. Separately, start and then immediately stop (✕) a session, and confirm no `cookSessions` document was written for it. This step can't be run by an agentic implementer without live infra access — note in the report if it wasn't possible, that's expected; the build/lint checks in Step 4 are the verifiable bar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cookSessions.ts src/components/RecipeDetail.tsx src/components/CookDock.tsx
git commit -m "$(cat <<'EOF'
feat: wire cook-session tracking into the cook-mode dock

Phase C frontend half: RecipeDetail.tsx now starts a backend
cook-session when guided cooking begins (signed-in users only),
finishes it when the last step completes, and abandons it if the
user stops early. CookDock logs every screen/step transition
(including the ingredient checklist) via a new onStepEntered
callback. All calls are fire-and-forget - the existing client-side
stopwatch and step state (Phase B) remain what the user actually
sees, this is a parallel recording layer only.

docs/superpowers/specs/2026-08-14-cook-session-backend-design.md
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Redis live session with 24h refreshed TTL ✓ Task 1 Step 4. Mongo permanent record with full per-step timeline, `"checklist"` excluded ✓ Task 1 Step 4 (`finishSession`). Four endpoints, all default-auth (no `@Public()`) ✓ Task 1 Step 8. `stepKey`/`stepNum` format matching `CookDock`'s existing key format ✓ Task 2 Step 3. Server-side timestamps only ✓ Task 1 Step 4 (`new Date().toISOString()` inside the service, never from the request body). Not combined with `ActivityLogModule` ✓ Task 1 Step 10 (module has no such import). Signed-in-only gating ✓ Task 2 Step 2 (`if (currentUserId && recipe)`). Fire-and-forget/silent-failure everywhere ✓ Task 2 Step 1 (every wrapper try/catches and returns `null`/`void`, never throws). `finish`/`abandon` no-op on missing session ✓ Task 1 Step 4 (`if (!session) return`) and Step 8 (controller doesn't need special-casing since the service already tolerates it). Full-timeline persistence per your "Full timeline (recommended)" answer ✓ Task 1 Step 4's `steps` array. 24h TTL per your answer ✓ `SESSION_TTL_SECONDS = 86400`, refreshed on every write. Separate-from-activity-log per your explicit clarification ✓ confirmed no import anywhere in Task 1.
- **Placeholder scan:** No TBD/TODO; every code block is complete, including full test suites for both service and controller.
- **Type consistency:** `CookSessionsService`'s method names/signatures (`startSession`, `logStep`, `finishSession`, `abandonSession`) match exactly between the service (Step 4), its tests (Step 2), and the controller that calls them (Step 8/6). Frontend `cookSessions.ts` function names/signatures match exactly what `RecipeDetail.tsx` (Task 2 Step 2) and `CookDock.tsx` (Task 2 Step 3) call. `stepKey`/`stepNum` types (`string`/`number`) consistent across the Mongo schema, Redis JSON shape, controller DTO, and both frontend call sites.
