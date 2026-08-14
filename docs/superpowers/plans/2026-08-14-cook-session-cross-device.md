# Cook Mode Redesign — Phase D: Cross-Device Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user resume an in-progress cook session on a different device than the one they started it on — same step, same checked ingredients/steps, same elapsed-time baseline, auto-resumed silently.

**Architecture:** Extend the existing `api/src/cook-sessions/` Redis session blob (Phase C) with a mutable resume-state snapshot (current step, checked steps/ingredients) that sits alongside the untouched append-only `events` log. Add a secondary Redis index key (`cook-session-active:{userId}:{recipeId}` → `sessionId`) so a device can discover an active session without already holding its UUID. Add two endpoints (`GET /cook-sessions/active/:recipeId`, `POST /cook-sessions/:sessionId/sync`). On the frontend, `RecipeDetail.tsx` checks for an active session on every recipe load and auto-resumes into it, polls every 5s while a session is active to catch cross-device updates, and pushes local state changes to the sync endpoint via the existing `onStepEntered` callback plus one new effect for checked-state-only changes.

**Tech Stack:** NestJS, Mongoose, ioredis, React/Vite, Clerk. No new dependencies.

## Global Constraints

- The Mongo `CookSession` schema (`api/src/cook-sessions/schemas/cook-session.schema.ts`) does NOT change in this phase — only the Redis JSON shape gains new fields.
- The existing `events` array (Phase C, used for Mongo duration math on finish) is never touched by the new sync endpoint — `sync` only ever writes `currentStepKey`/`currentStepNum`/`checkedSteps`/`checkedIngredients`.
- New index key format: `cook-session-active:{userId}:{recipeId}`, value is the plain `sessionId` string, same `SESSION_TTL_SECONDS` (86400) TTL semantics as the main session key — set on `startSession`, refreshed (`EXPIRE`) alongside every write that refreshes the main session key's TTL (`logStep`, `syncState`), deleted on `finishSession`/`abandonSession`.
- All Redis writes to the main session key continue using the atomic `SET key value EX seconds` form (established in Phase C's final review) — never a separate `SET` + `EXPIRE`.
- Every new/modified service method keeps the exact ownership-check convention already established in Phase C: `if (!session || session.userId !== userId) return` (or `return null` for read paths) — silent no-op, never throws, never leaks whether a session/recipe combination exists to a non-owner.
- `GET /cook-sessions/active/:recipeId` returns `null` (HTTP 200) when no active session exists — this is an expected, common case, not an error.
- New DTO (`SyncCookSessionDto`) follows the exact `class-validator` decorator style already used in `api/src/cook-sessions/dto/log-step.dto.ts`.
- All new frontend calls in `src/lib/cookSessions.ts` are fire-and-forget: try/catch, swallow errors, never throw, matching every existing function in that file.
- Auto-resume is always silent, with zero warning/prompt, whether triggered by loading the recipe page or by clicking "Start cooking" again on the same recipe — this phase never asks for confirmation (Phase F's later warning is strictly for a *different* recipe, out of scope here).
- No new npm dependencies in either `api/` or the root frontend package.

---

## Task 1: Backend — Redis resume-state, index key, and two new endpoints

**Files:**
- Modify (full rewrite): `api/src/cook-sessions/cook-sessions.service.ts`
- Modify (full rewrite): `api/src/cook-sessions/cook-sessions.service.spec.ts`
- Modify (full rewrite): `api/src/cook-sessions/cook-sessions.controller.ts`
- Modify (full rewrite): `api/src/cook-sessions/cook-sessions.controller.spec.ts`
- Create: `api/src/cook-sessions/dto/sync-cook-session.dto.ts`

**Interfaces:**
- Produces: `CookSessionsService.syncState(sessionId: string, userId: string, currentStepKey: string | null, currentStepNum: number, checkedSteps: string[], checkedIngredients: string[]): Promise<void>`, `CookSessionsService.getActiveSession(userId: string, recipeId: string): Promise<ActiveCookSessionView | null>` where `ActiveCookSessionView = { sessionId: string; currentStepKey: string | null; currentStepNum: number; checkedSteps: string[]; checkedIngredients: string[]; startedAt: string }`.
- Produces (HTTP, consumed by Task 2): `GET /cook-sessions/active/:recipeId` → `ActiveCookSessionView | null`; `POST /cook-sessions/:sessionId/sync` body `{ currentStepKey: string | null; currentStepNum: number; checkedSteps: string[]; checkedIngredients: string[] }` → `{ ok: true }`.
- Consumes: `RedisService.getClient()` (unchanged, already used by every method in this file).

- [ ] **Step 1: Replace `api/src/cook-sessions/cook-sessions.service.ts` with:**

```ts
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
  currentStepKey: string | null
  currentStepNum: number
  checkedSteps: string[]
  checkedIngredients: string[]
}

export interface ActiveCookSessionView {
  sessionId: string
  currentStepKey: string | null
  currentStepNum: number
  checkedSteps: string[]
  checkedIngredients: string[]
  startedAt: string
}

function redisKey(sessionId: string): string {
  return `cook-session:${sessionId}`
}

// Reverse index: sessionId is an opaque UUID with no other way to look it
// up by (userId, recipeId) - this key is what makes cross-device discovery
// possible at all.
function activeIndexKey(userId: string, recipeId: string): string {
  return `cook-session-active:${userId}:${recipeId}`
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

  private async readSession(sessionId: string): Promise<RedisSession | null> {
    const raw = await this.redis.getClient().get(redisKey(sessionId))
    if (!raw) return null
    return JSON.parse(raw) as RedisSession
  }

  async logStep(sessionId: string, userId: string, stepKey: string, stepNum: number): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    session.events.push({ stepKey, stepNum, enteredAt: new Date().toISOString() })
    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
    await client.expire(activeIndexKey(session.userId, session.recipeId), SESSION_TTL_SECONDS)
  }

  async syncState(
    sessionId: string,
    userId: string,
    currentStepKey: string | null,
    currentStepNum: number,
    checkedSteps: string[],
    checkedIngredients: string[],
  ): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    session.currentStepKey = currentStepKey
    session.currentStepNum = currentStepNum
    session.checkedSteps = checkedSteps
    session.checkedIngredients = checkedIngredients

    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
    await client.expire(activeIndexKey(session.userId, session.recipeId), SESSION_TTL_SECONDS)
  }

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

  async finishSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    const finishedAt = new Date(Date.now())
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
}
```

- [ ] **Step 2: Replace `api/src/cook-sessions/cook-sessions.service.spec.ts` with:**

```ts
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

  it('startSession writes a new Redis entry and an active-session index entry, returns a sessionId', async () => {
    const service = await makeService()
    const sessionId = await service.startSession('user_1', 'recipe_a')
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
    expect(set).toHaveBeenCalledWith(
      `cook-session:${sessionId}`,
      expect.stringContaining('"userId":"user_1"'),
      'EX',
      86400,
    )
    expect(set).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a', sessionId, 'EX', 86400)
  })

  it('logStep appends an event, refreshes the session TTL, and refreshes the active-session index TTL', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.logStep('session_1', 'user_1', '0-0', 1)

    expect(set).toHaveBeenCalledWith(
      'cook-session:session_1',
      expect.stringContaining('"stepKey":"0-0"'),
      'EX',
      86400,
    )
    expect(expire).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a', 86400)
  })

  it('logStep silently no-ops when the caller does not own the session', async () => {
    const existing = {
      userId: 'owner_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.logStep('session_1', 'attacker_1', '0-0', 1)
    expect(set).not.toHaveBeenCalled()
  })

  it('logStep on a missing Redis key silently no-ops', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.logStep('gone', 'user_1', '0-0', 1)).resolves.toBeUndefined()
    expect(set).not.toHaveBeenCalled()
  })

  it('syncState overwrites the current-step and checked-item snapshot fields, leaves events untouched, refreshes both TTLs', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [{ stepKey: '0-0', stepNum: 1, enteredAt: '2026-08-14T10:00:30.000Z' }],
      currentStepKey: '0-0', currentStepNum: 1, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.syncState('session_1', 'user_1', '0-1', 2, ['0-0'], ['0-0', '1-0'])

    const [key, valueJson, exFlag, ttl] = set.mock.calls[0]
    expect(key).toBe('cook-session:session_1')
    expect(exFlag).toBe('EX')
    expect(ttl).toBe(86400)
    const written = JSON.parse(valueJson)
    expect(written.currentStepKey).toBe('0-1')
    expect(written.currentStepNum).toBe(2)
    expect(written.checkedSteps).toEqual(['0-0'])
    expect(written.checkedIngredients).toEqual(['0-0', '1-0'])
    expect(written.events).toEqual(existing.events)

    expect(expire).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a', 86400)
  })

  it('syncState silently no-ops when the caller does not own the session', async () => {
    const existing = {
      userId: 'owner_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.syncState('session_1', 'attacker_1', '0-0', 1, [], [])
    expect(set).not.toHaveBeenCalled()
  })

  it('syncState on a missing Redis key silently no-ops', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.syncState('gone', 'user_1', '0-0', 1, [], [])).resolves.toBeUndefined()
    expect(set).not.toHaveBeenCalled()
  })

  it('getActiveSession returns the resumable view when an active session exists for this user+recipe', async () => {
    get.mockImplementation((key: string) => {
      if (key === 'cook-session-active:user_1:recipe_a') return Promise.resolve('session_1')
      if (key === 'cook-session:session_1') {
        return Promise.resolve(JSON.stringify({
          userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
          events: [], currentStepKey: '0-1', currentStepNum: 2,
          checkedSteps: ['0-0'], checkedIngredients: ['0-0'],
        }))
      }
      return Promise.resolve(null)
    })
    const service = await makeService()
    const result = await service.getActiveSession('user_1', 'recipe_a')
    expect(result).toEqual({
      sessionId: 'session_1',
      currentStepKey: '0-1',
      currentStepNum: 2,
      checkedSteps: ['0-0'],
      checkedIngredients: ['0-0'],
      startedAt: '2026-08-14T10:00:00.000Z',
    })
  })

  it('getActiveSession returns null when no index entry exists for this user+recipe', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.getActiveSession('user_1', 'recipe_a')).resolves.toBeNull()
  })

  it('getActiveSession returns null when the index points to a session that no longer exists', async () => {
    get.mockImplementation((key: string) => {
      if (key === 'cook-session-active:user_1:recipe_a') return Promise.resolve('session_1')
      return Promise.resolve(null)
    })
    const service = await makeService()
    await expect(service.getActiveSession('user_1', 'recipe_a')).resolves.toBeNull()
  })

  it('finishSession computes per-step durations, writes the Mongo doc, and deletes both the session and index Redis keys', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [
        { stepKey: 'checklist', stepNum: 0, enteredAt: '2026-08-14T10:00:00.000Z' },
        { stepKey: '0-0', stepNum: 1, enteredAt: '2026-08-14T10:00:30.000Z' },
        { stepKey: '0-1', stepNum: 2, enteredAt: '2026-08-14T10:02:00.000Z' },
      ],
      currentStepKey: '0-1', currentStepNum: 2, checkedSteps: ['0-0'], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    create.mockResolvedValue({})
    const service = await makeService()

    const realDateNow = Date.now
    Date.now = () => new Date('2026-08-14T10:03:00.000Z').getTime()
    try {
      await service.finishSession('session_1', 'user_1')
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
    expect(del).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a')
  })

  it('finishSession on a missing Redis key silently no-ops without writing to Mongo', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.finishSession('gone', 'user_1')).resolves.toBeUndefined()
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('finishSession silently no-ops when the caller does not own the session', async () => {
    const existing = {
      userId: 'owner_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.finishSession('session_1', 'attacker_1')
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('abandonSession deletes both the session and index Redis keys', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.abandonSession('session_1', 'user_1')
    expect(del).toHaveBeenCalledWith('cook-session:session_1')
    expect(del).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a')
  })

  it('abandonSession silently no-ops when the caller does not own the session', async () => {
    const existing = {
      userId: 'owner_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.abandonSession('session_1', 'attacker_1')
    expect(del).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the service tests**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: PASS (16 tests)

- [ ] **Step 4: Create `api/src/cook-sessions/dto/sync-cook-session.dto.ts`**

```ts
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class SyncCookSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  currentStepKey!: string | null

  @IsInt()
  @Min(0)
  currentStepNum!: number

  @IsArray()
  @IsString({ each: true })
  checkedSteps!: string[]

  @IsArray()
  @IsString({ each: true })
  checkedIngredients!: string[]
}
```

- [ ] **Step 5: Replace `api/src/cook-sessions/cook-sessions.controller.ts` with:**

```ts
import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookSessionsService } from './cook-sessions.service'
import { LogStepDto } from './dto/log-step.dto'
import { SyncCookSessionDto } from './dto/sync-cook-session.dto'

@Controller('cook-sessions')
export class CookSessionsController {
  constructor(private readonly cookSessionsService: CookSessionsService) {}

  @Get('active/:recipeId')
  async getActive(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getActiveSession(req.userId, recipeId)
  }

  @Post(':recipeId')
  async start(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    const sessionId = await this.cookSessionsService.startSession(req.userId, recipeId)
    return { sessionId }
  }

  @Post(':sessionId/steps')
  async logStep(
    @Param('sessionId') sessionId: string,
    @Body() body: LogStepDto,
    @Req() req: Request & { userId: string },
  ) {
    await this.cookSessionsService.logStep(sessionId, req.userId, body.stepKey, body.stepNum)
    return { ok: true }
  }

  @Post(':sessionId/sync')
  async sync(
    @Param('sessionId') sessionId: string,
    @Body() body: SyncCookSessionDto,
    @Req() req: Request & { userId: string },
  ) {
    await this.cookSessionsService.syncState(
      sessionId,
      req.userId,
      body.currentStepKey,
      body.currentStepNum,
      body.checkedSteps,
      body.checkedIngredients,
    )
    return { ok: true }
  }

  @Post(':sessionId/finish')
  async finish(@Param('sessionId') sessionId: string, @Req() req: Request & { userId: string }) {
    await this.cookSessionsService.finishSession(sessionId, req.userId)
    return { ok: true }
  }

  @Delete(':sessionId')
  async abandon(@Param('sessionId') sessionId: string, @Req() req: Request & { userId: string }) {
    await this.cookSessionsService.abandonSession(sessionId, req.userId)
    return { ok: true }
  }
}
```

- [ ] **Step 6: Replace `api/src/cook-sessions/cook-sessions.controller.spec.ts` with:**

```ts
import { CookSessionsController } from './cook-sessions.controller'

describe('CookSessionsController', () => {
  const cookSessionsService = {
    startSession: jest.fn(),
    logStep: jest.fn(),
    syncState: jest.fn(),
    getActiveSession: jest.fn(),
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
    const result = await controller.logStep('session_1', { stepKey: '0-0', stepNum: 1 }, { userId: 'user_1' } as any)
    expect(cookSessionsService.logStep).toHaveBeenCalledWith('session_1', 'user_1', '0-0', 1)
    expect(result).toEqual({ ok: true })
  })

  it('POST /cook-sessions/:sessionId/sync updates the resumable snapshot', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const body = { currentStepKey: '0-1', currentStepNum: 2, checkedSteps: ['0-0'], checkedIngredients: ['0-0'] }
    const result = await controller.sync('session_1', body, { userId: 'user_1' } as any)
    expect(cookSessionsService.syncState).toHaveBeenCalledWith('session_1', 'user_1', '0-1', 2, ['0-0'], ['0-0'])
    expect(result).toEqual({ ok: true })
  })

  it('GET /cook-sessions/active/:recipeId returns the active session view for the authenticated user', async () => {
    const view = {
      sessionId: 'session_1', currentStepKey: '0-1', currentStepNum: 2,
      checkedSteps: ['0-0'], checkedIngredients: [], startedAt: '2026-08-14T10:00:00.000Z',
    }
    cookSessionsService.getActiveSession.mockResolvedValue(view)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getActive('recipe_a', { userId: 'user_1' } as any)
    expect(cookSessionsService.getActiveSession).toHaveBeenCalledWith('user_1', 'recipe_a')
    expect(result).toEqual(view)
  })

  it('GET /cook-sessions/active/:recipeId returns null when there is no active session', async () => {
    cookSessionsService.getActiveSession.mockResolvedValue(null)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getActive('recipe_a', { userId: 'user_1' } as any)
    expect(result).toBeNull()
  })

  it('POST /cook-sessions/:sessionId/finish finishes a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.finish('session_1', { userId: 'user_1' } as any)
    expect(cookSessionsService.finishSession).toHaveBeenCalledWith('session_1', 'user_1')
    expect(result).toEqual({ ok: true })
  })

  it('DELETE /cook-sessions/:sessionId abandons a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.abandon('session_1', { userId: 'user_1' } as any)
    expect(cookSessionsService.abandonSession).toHaveBeenCalledWith('session_1', 'user_1')
    expect(result).toEqual({ ok: true })
  })
})
```

- [ ] **Step 7: Run the full API test suite**

Run: `cd api && npm test`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add api/src/cook-sessions
git commit -m "$(cat <<'EOF'
feat: add cross-device resume-state to cook-sessions backend

Phase D of the cook-mode redesign - extends the Redis cook-session
blob (Phase C) with a mutable resume-state snapshot (current step,
checked steps/ingredients) alongside the untouched append-only
events log, plus a new reverse-index key
(cook-session-active:{userId}:{recipeId}) so a device can discover
an active session without already holding its sessionId. Two new
endpoints: GET /cook-sessions/active/:recipeId (discovery) and
POST /cook-sessions/:sessionId/sync (push local state changes).

docs/superpowers/specs/2026-08-14-cook-session-cross-device-design.md
EOF
)"
```

---

## Task 2: Frontend — auto-resume on load, 5s polling, sync on state change

**Files:**
- Modify: `src/lib/cookSessions.ts`
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/components/CookDock.tsx`

**Interfaces:**
- Consumes (from Task 1, via HTTP): `GET /cook-sessions/active/:recipeId` → `ActiveCookSession | null`; `POST /cook-sessions/:sessionId/sync` body `{ currentStepKey, currentStepNum, checkedSteps, checkedIngredients }`.
- Produces: `src/lib/cookSessions.ts` gains `export interface ActiveCookSession { sessionId: string; currentStepKey: string | null; currentStepNum: number; checkedSteps: string[]; checkedIngredients: string[]; startedAt: string }`, `getActiveCookSession(recipeId: string, getToken: () => Promise<string | null>): Promise<ActiveCookSession | null>`, `syncCookSession(sessionId: string, currentStepKey: string | null, currentStepNum: number, checkedSteps: string[], checkedIngredients: string[], getToken: () => Promise<string | null>): Promise<void>`. `CookDockProps` gains `elapsedBaselineMs?: number`.

- [ ] **Step 1: Add the two new functions and the type to `src/lib/cookSessions.ts`**

Append this to the end of the file (after the existing `abandonCookSession` function):

```ts

export interface ActiveCookSession {
  sessionId: string
  currentStepKey: string | null
  currentStepNum: number
  checkedSteps: string[]
  checkedIngredients: string[]
  startedAt: string
}

export async function getActiveCookSession(
  recipeId: string,
  getToken: () => Promise<string | null>
): Promise<ActiveCookSession | null> {
  try {
    const token = await getToken()
    const res = await fetch(`/api/cook-sessions/active/${recipeId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return null
    return (await res.json()) as ActiveCookSession | null
  } catch {
    return null
  }
}

export async function syncCookSession(
  sessionId: string,
  currentStepKey: string | null,
  currentStepNum: number,
  checkedSteps: string[],
  checkedIngredients: string[],
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ currentStepKey, currentStepNum, checkedSteps, checkedIngredients }),
    })
  } catch {
    // best-effort, never blocks cooking
  }
}
```

- [ ] **Step 2: Wire discovery, polling, and sync into `RecipeDetail.tsx`**

Add the import near the existing `../lib/cookSessions` import (find `import { startCookSession, logCookSessionStep, finishCookSession, abandonCookSession } from '../lib/cookSessions'`):

```ts
import { startCookSession, logCookSessionStep, finishCookSession, abandonCookSession } from '../lib/cookSessions'
```

becomes:

```ts
import {
  startCookSession, logCookSessionStep, finishCookSession, abandonCookSession,
  getActiveCookSession, syncCookSession,
} from '../lib/cookSessions'
```

Find the `cookSessionId`/`pendingCookStepRef` declarations (around line 68-69):

```tsx
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
  const pendingCookStepRef = useRef<{ stepKey: string; stepNum: number } | null>(null)
```

Replace with:

```tsx
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
  const pendingCookStepRef = useRef<{ stepKey: string; stepNum: number } | null>(null)
  // Tracks the last stepKey/stepNum passed to handleStepEntered (including
  // 'checklist') so the checked-state-only sync effect below can include
  // it without RecipeDetail needing to know CookDock's internal screen
  // state directly.
  const lastEnteredStepRef = useRef<{ stepKey: string; stepNum: number }>({ stepKey: 'checklist', stepNum: 0 })
```

Find the existing "Reset checked steps/ingredients" effect (around line 453-467):

```tsx
  // Reset checked steps/ingredients and scroll when recipe changes
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`checked-${id}`)
      setCheckedSteps(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedSteps(new Set()) }
    try {
      const saved = sessionStorage.getItem(`checked-ingredients-${id}`)
      setCheckedIngredients(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedIngredients(new Set()) }
    window.scrollTo({ top: 0, behavior: 'instant' })
    setViewingRevision(null)
    setRevisionsOpen(false)
    setRevisions(null)
  }, [id])
```

Add a new effect immediately after it (do not modify the effect above - this is a separate, additional effect that runs after it and can override its `sessionStorage`-based restore with server state when a session exists):

```tsx

  // Cross-device resume (Phase D): on loading a recipe, check whether the
  // signed-in user already has an active cook session for it elsewhere -
  // if so, silently resume into it (no prompt, per design - this applies
  // identically whether reached by page load or by clicking "Start
  // cooking" again on the same recipe) instead of the sessionStorage-only
  // restore above.
  useEffect(() => {
    if (!id || !currentUserId) return
    let cancelled = false
    getActiveCookSession(id, getToken).then(session => {
      if (cancelled || !session) return
      setCheckedSteps(new Set(session.checkedSteps))
      setCheckedIngredients(new Set(session.checkedIngredients))
      const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
        ? Math.max(0, session.currentStepNum - 1)
        : 0
      setWizardIndex(resumedIndex)
      lastEnteredStepRef.current = session.currentStepKey
        ? { stepKey: session.currentStepKey, stepNum: session.currentStepNum }
        : { stepKey: 'checklist', stepNum: 0 }
      setCookSessionId(session.sessionId)
      setCookSessionStartedAt(session.startedAt)
      setCookSessionActive(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render from useAuth(); only id/currentUserId changing should re-trigger discovery
  }, [id, currentUserId])

  // While a session is active, poll for changes made from another device
  // (Phase D) - server-wins on every tick, no merge logic.
  useEffect(() => {
    if (!cookSessionActive || !id || !currentUserId) return
    const interval = setInterval(() => {
      getActiveCookSession(id, getToken).then(session => {
        if (!session) return
        setCheckedSteps(new Set(session.checkedSteps))
        setCheckedIngredients(new Set(session.checkedIngredients))
        const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
          ? Math.max(0, session.currentStepNum - 1)
          : 0
        setWizardIndex(resumedIndex)
      })
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render from useAuth(); only cookSessionActive/id/currentUserId changing should restart polling
  }, [cookSessionActive, id, currentUserId])
```

Find `handleStepEntered` (currently):

```tsx
  function handleStepEntered(stepKey: string, stepNum: number) {
    if (!cookSessionId) {
      pendingCookStepRef.current = { stepKey, stepNum }
      return
    }
    logCookSessionStep(cookSessionId, stepKey, stepNum, getToken)
  }
```

Replace with:

```tsx
  function handleStepEntered(stepKey: string, stepNum: number) {
    lastEnteredStepRef.current = { stepKey, stepNum }
    if (!cookSessionId) {
      pendingCookStepRef.current = { stepKey, stepNum }
      return
    }
    logCookSessionStep(cookSessionId, stepKey, stepNum, getToken)
    syncCookSession(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
  }
```

Find `openWizard()` (currently):

```tsx
  function openWizard() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
    setCookSessionActive(true)
    setCookSessionId(null)
    pendingCookStepRef.current = null
    if (currentUserId && recipe) {
      startCookSession(recipe.id, getToken).then(id => {
        setCookSessionId(id)
        if (id && pendingCookStepRef.current) {
          const { stepKey, stepNum } = pendingCookStepRef.current
          pendingCookStepRef.current = null
          logCookSessionStep(id, stepKey, stepNum, getToken)
        }
      })
    }
  }
```

Replace with:

```tsx
  function openWizard() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
    setCookSessionActive(true)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
    pendingCookStepRef.current = null
    lastEnteredStepRef.current = { stepKey: 'checklist', stepNum: 0 }
    if (currentUserId && recipe) {
      startCookSession(recipe.id, getToken).then(id => {
        setCookSessionId(id)
        if (id && pendingCookStepRef.current) {
          const { stepKey, stepNum } = pendingCookStepRef.current
          pendingCookStepRef.current = null
          logCookSessionStep(id, stepKey, stepNum, getToken)
        }
      })
    }
  }
```

Find `stopCooking()` (currently):

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

Replace with:

```tsx
  function stopCooking() {
    if (cookSessionId) {
      abandonCookSession(cookSessionId, getToken)
      setCookSessionId(null)
    }
    setCookSessionStartedAt(null)
    setCookSessionActive(false)
    backgroundCookStatusRef.current?.exitFloatingView()
  }
```

Add a new effect right after `handleStepEntered` (this handles checked-state changes that happen *without* a step transition, e.g. checking an ingredient while staying on the checklist screen - step-transition-triggered syncs are already covered by `handleStepEntered` above):

```tsx

  // Push checked-state changes to the backend session (Phase D) even when
  // they happen without a step transition (e.g. ticking an ingredient
  // while staying on the checklist screen) - step-transition-triggered
  // syncs are already covered inside handleStepEntered above.
  useEffect(() => {
    if (!cookSessionId) return
    const { stepKey, stepNum } = lastEnteredStepRef.current
    syncCookSession(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render; this effect should only re-fire on an actual checked-state change, not on every render
  }, [checkedSteps, checkedIngredients])
```

Find the `<CookDock .../>` render call and add the new prop right after `lightboxOpen={!!lightboxUrl}`:

```tsx
          lightboxOpen={!!lightboxUrl}
```

becomes:

```tsx
          lightboxOpen={!!lightboxUrl}
          elapsedBaselineMs={cookSessionStartedAt ? new Date(cookSessionStartedAt).getTime() : undefined}
```

- [ ] **Step 3: Add the elapsed-baseline prop to `CookDock.tsx`**

Add `elapsedBaselineMs` to `CookDockProps`, right after `lightboxOpen: boolean`:

```tsx
  lightboxOpen: boolean
}
```

becomes:

```tsx
  lightboxOpen: boolean
  elapsedBaselineMs?: number
}
```

Add it to the destructured props, right after `lightboxOpen`:

```tsx
  onOpenLightbox, timerBarHeight, lightboxOpen,
}: CookDockProps) {
```

becomes:

```tsx
  onOpenLightbox, timerBarHeight, lightboxOpen, elapsedBaselineMs,
}: CookDockProps) {
```

Find the elapsed-time stopwatch's ref initialization:

```tsx
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedStartRef = useRef<number | null>(null)
```

Replace with:

```tsx
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // Resumed sessions (Phase D) pass their real start time here so the
  // stopwatch continues from the correct offset instead of restarting at
  // 0 - a fresh (non-resumed) session gets undefined and behaves exactly
  // as before (Date.now() the first time the real steps screen is shown).
  const elapsedStartRef = useRef<number | null>(elapsedBaselineMs ?? null)
```

- [ ] **Step 4: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/lib/cookSessions.ts src/components/CookDock.tsx src/components/RecipeDetail.tsx
```

Expected: no errors, no unexpected warnings (the two new `react-hooks/exhaustive-deps` disables added above are intentional and documented, matching the existing pattern already used elsewhere in this file).

- [ ] **Step 5: Manual verification**

With the backend running and two signed-in browser sessions (or one browser plus one incognito window on the same account) available: start cooking a recipe in window A, advance a step and check an ingredient, then open the same recipe in window B and confirm it auto-resumes at the same step with the same checks (no prompt). Advance further in window B, wait up to 5 seconds, and confirm window A's dock updates to match on its next poll. Finish the cook from either window and confirm the other window's dock disappears on its next poll (session gone). This step can't be run by an agentic implementer without live infra and two browser sessions - note in the report if it wasn't possible, that's expected; Step 4's build/lint checks are the verifiable bar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cookSessions.ts src/components/RecipeDetail.tsx src/components/CookDock.tsx
git commit -m "$(cat <<'EOF'
feat: auto-resume cook sessions across devices

Phase D frontend half: RecipeDetail.tsx checks for an active cook
session on every recipe load (signed-in users only) and silently
resumes into it - same step, same checked ingredients/steps, same
elapsed-time baseline, no confirmation prompt, whether reached by
page load or by clicking "Start cooking" again on the same recipe.
While a session is active, polls every 5s to pick up changes made
from another device (server-wins, no merge logic). Local state
changes push to the new sync endpoint via the existing
onStepEntered callback plus one new effect for checked-state-only
changes. CookDock gains one new elapsedBaselineMs prop so a resumed
stopwatch continues from the right offset instead of restarting.

docs/superpowers/specs/2026-08-14-cook-session-cross-device-design.md
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Redis resume-state fields (`currentStepKey`/`currentStepNum`/`checkedSteps`/`checkedIngredients`) added alongside untouched `events` ✓ Task 1 Step 1. Secondary index key, set on start/refreshed on logStep+sync/deleted on finish+abandon ✓ Task 1 Step 1 (all five methods). Atomic `SET ... EX` convention preserved ✓ Task 1 Step 1 (`syncState`, `startSession` both use the 4-arg form). Ownership-check convention preserved on all new/modified methods ✓ Task 1 Step 1. `GET .../active/:recipeId` returns `null` not an error when nothing found ✓ Task 1 Step 1 (`getActiveSession`) and Step 5 (controller just returns the service's result directly, including `null`). New DTO matches `LogStepDto`'s decorator style ✓ Task 1 Step 4. Fire-and-forget frontend calls ✓ Task 2 Step 1 (both new functions try/catch). Silent, no-prompt auto-resume regardless of entry point ✓ Task 2 Step 2 (discovery effect fires on every recipe load; nothing in `openWizard()` checks for or defers to an existing session before starting fresh, but that's fine - discovery already resumes automatically before the user would ever need to click "Start cooking" again on the same recipe: if a session exists, `cookSessionActive` is already `true` and the dock is already showing by the time the page has loaded, per the Background section's description of "Start cooking" today only mattering when no session is active yet). 5s polling ✓ Task 2 Step 2 (`setInterval(..., 5000)`). Elapsed-time baseline from `startedAt` ✓ Task 2 Step 2 (`elapsedBaselineMs` prop) and Step 3 (`CookDock`'s ref initialization). Mongo schema untouched ✓ confirmed no `schemas/cook-session.schema.ts` file appears in Task 1's file list.
- **Placeholder scan:** No TBD/TODO; every code block is complete, including full test-file rewrites.
- **Type consistency:** `ActiveCookSessionView` (backend) and `ActiveCookSession` (frontend) have identical field names/types (`sessionId: string`, `currentStepKey: string | null`, `currentStepNum: number`, `checkedSteps: string[]`, `checkedIngredients: string[]`, `startedAt: string`) - the frontend type is a hand-written mirror of the backend's JSON response shape, consistent field-for-field. `syncState`'s service signature (`sessionId, userId, currentStepKey, currentStepNum, checkedSteps, checkedIngredients`) matches exactly how the controller (Task 1 Step 5) and the frontend's `syncCookSession` (Task 2 Step 1, minus the server-injected `userId`) call it.
