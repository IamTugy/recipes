# Timer Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If subagent dispatch fails (spawn limit reached), fall back to superpowers:executing-plans and complete the remaining tasks inline.

**Goal:** Alert the owner when any timer (cook-mode or standalone) finishes even while the app/phone is backgrounded, via Web Push.

**Architecture:** New `TimersModule` on the backend owns two Mongo collections (`Timer`, `PushSubscription`) plus a `setInterval`-driven sweep that sends a VAPID-signed push (via the `web-push` npm package) to every subscription of a timer's owner once its `endsAt` has passed. The frontend mirrors every timer start/pause/resume/cancel/completion to this backend through `useTimers.ts`'s existing single choke point (`addTimer`/`toggleTimer`/`removeTimer`/`resetTimer`), and `public/sw.js` gains `push`/`notificationclick` handlers to actually show the OS notification and route a tap back into the app.

**Tech Stack:** NestJS (api/), Mongoose, `web-push` (new dependency), React/Vite frontend, Clerk auth (`getToken`), the browser's native Push API + Service Worker.

## Global Constraints

- `Timer` collection: `userId`, `clientId` (the frontend's own timer id, unique per `userId`), `recipeId`, `label`, `endsAt` (epoch ms), `pushSent` (bool). NOT scoped to cook sessions — every timer start mirrors here.
- `PushSubscription` collection: `userId`, `endpoint` (unique), `keys` (`p256dh`/`auth`), `deviceLabel?`. Upserted by `endpoint`.
- Sweep runs on a plain `setInterval` every 5000ms — no new scheduling npm dependency (this app has none, one query isn't worth adding one).
- New npm dependency: `web-push` (API side only).
- A `web-push` send failing with `statusCode === 410` deletes that `PushSubscription`. Any other failure leaves `pushSent: false` untouched and does NOT delete the subscription — the next sweep cycle retries.
- `Timer` rows are deleted client-triggered only (`DELETE /timers/:clientId`) on cancel/pause/manual-removal/natural-completion — never left to accumulate server-side.
- A push is sent to ALL of a user's `PushSubscription`s (multi-device), never just the most recent.
- Permission is requested and subscription attempted on ANY timer start (not just cook-session ones), from `useTimers.ts`'s `addTimer`. A denied/failed permission or any network failure must NEVER block or break local timer functionality — every sync call is fire-and-forget, same tolerance-for-failure posture as this app's existing `activityLog.record()` calls.
- `public/sw.js` keeps its existing `install`/`activate`/`fetch` handlers untouched — only add `push`/`notificationclick`.
- No frontend test framework exists in this repo — frontend tasks get manual-verification steps, not automated tests. Backend gets full Jest coverage.

---

### Task 1: Timer & PushSubscription schemas + web-push dependency

**Files:**
- Create: `api/src/timers/schemas/timer.schema.ts`
- Create: `api/src/timers/schemas/push-subscription.schema.ts`
- Modify: `api/package.json` (add `web-push` dependency)

**Interfaces:**
- Produces: `Timer` class + `TimerDocument` type + `TimerSchema`; `PushSubscription` class + `PushSubscriptionDocument` type + `PushSubscriptionSchema`. Both consumed by Task 2/3's services.

- [ ] **Step 1: Install the `web-push` package**

Run: `cd api && npm install web-push && npm install -D @types/web-push`
Expected: `api/package.json` gains `web-push` under `dependencies` and `@types/web-push` under `devDependencies`.

- [ ] **Step 2: Create the Timer schema**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TimerDocument = Timer & Document

@Schema({ timestamps: true })
export class Timer {
  @Prop({ required: true, index: true })
  userId!: string

  // The frontend's own timer id (e.g. "timer-5") - used as the join key
  // for create/delete instead of Mongo's own _id, so the client never
  // needs to learn a server-generated id just to cancel a timer it
  // already knows the id of.
  @Prop({ required: true })
  clientId!: string

  @Prop({ required: true })
  recipeId!: string

  @Prop({ required: true })
  label!: string

  // Epoch ms this timer reaches zero - mirrors TimerState.endsAt on the
  // frontend (src/types.ts).
  @Prop({ required: true })
  endsAt!: number

  @Prop({ default: false })
  pushSent!: boolean
}

export const TimerSchema = SchemaFactory.createForClass(Timer)

// One row per (user, client timer) - upsert() on this key so a resumed
// timer (same clientId, new endsAt) replaces its own row instead of
// colliding with a stale one that failed to get deleted on pause.
TimerSchema.index({ userId: 1, clientId: 1 }, { unique: true })
```

- [ ] **Step 3: Create the PushSubscription schema**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type PushSubscriptionDocument = PushSubscription & Document

@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ required: true, index: true })
  userId!: string

  // Uniquely identifies this browser/device's subscription - the same
  // endpoint reappears if the same device subscribes again, which is what
  // makes the upsert-by-endpoint in PushService.subscribe() idempotent.
  @Prop({ required: true, unique: true })
  endpoint!: string

  @Prop({ required: true, type: { p256dh: String, auth: String } })
  keys!: { p256dh: string; auth: string }

  @Prop()
  deviceLabel?: string
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription)
```

- [ ] **Step 4: Verify the API still builds**

Run: `cd api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/timers/schemas api/package.json api/package-lock.json
git commit -m "feat: add Timer and PushSubscription schemas for timer push notifications"
```

---

### Task 2: PushService + PushController

**Files:**
- Create: `api/src/timers/push.service.ts`
- Create: `api/src/timers/push.service.spec.ts`
- Create: `api/src/timers/push.controller.ts`

**Interfaces:**
- Consumes: `PushSubscription`/`PushSubscriptionDocument` from Task 1.
- Produces: `PushService` with `getPublicKey(): string`, `subscribe(userId: string, input: PushSubscriptionInput): Promise<void>`, `unsubscribe(endpoint: string): Promise<void>`, `sendToUser(userId: string, payload: { title: string; body: string }): Promise<void>`. `PushSubscriptionInput` type (`{ endpoint: string; keys: { p256dh: string; auth: string }; deviceLabel?: string }`). `PushController` at `/push` with `GET vapid-public-key`, `POST subscribe`, `POST unsubscribe`. Both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```typescript
import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import * as webpush from 'web-push'
import { PushService } from './push.service'
import { PushSubscription } from './schemas/push-subscription.schema'

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}))

describe('PushService', () => {
  const subscriptionModel = {
    findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    find: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  async function makeService(config: Record<string, string | undefined> = {
    VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:test@example.com',
  }) {
    const configService = { get: jest.fn((key: string) => config[key]) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getModelToken(PushSubscription.name), useValue: subscriptionModel },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()
    return moduleRef.get(PushService)
  }

  it('getPublicKey returns the configured VAPID public key', async () => {
    const service = await makeService()
    expect(service.getPublicKey()).toBe('pub')
  })

  it('getPublicKey throws when VAPID_PUBLIC_KEY is not configured', async () => {
    const service = await makeService({ VAPID_PUBLIC_KEY: undefined })
    expect(() => service.getPublicKey()).toThrow('VAPID_PUBLIC_KEY is not configured')
  })

  it('subscribe upserts by endpoint', async () => {
    const service = await makeService()
    await service.subscribe('user_1', { endpoint: 'https://push.example/abc', keys: { p256dh: 'a', auth: 'b' } })
    expect(subscriptionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/abc' },
      { endpoint: 'https://push.example/abc', keys: { p256dh: 'a', auth: 'b' }, userId: 'user_1' },
      { upsert: true },
    )
  })

  it('unsubscribe deletes by endpoint', async () => {
    const service = await makeService()
    await service.unsubscribe('https://push.example/abc')
    expect(subscriptionModel.deleteOne).toHaveBeenCalledWith({ endpoint: 'https://push.example/abc' })
  })

  it('sendToUser sends to every subscription for that user', async () => {
    const subs = [
      { _id: '1', endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } },
      { _id: '2', endpoint: 'e2', keys: { p256dh: 'c', auth: 'd' } },
    ]
    subscriptionModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(subs) })
    ;(webpush.sendNotification as jest.Mock).mockResolvedValue(undefined)
    const service = await makeService()

    await service.sendToUser('user_1', { title: 'Timer done', body: 'Pasta' })

    expect(subscriptionModel.find).toHaveBeenCalledWith({ userId: 'user_1' })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } },
      JSON.stringify({ title: 'Timer done', body: 'Pasta' }),
    )
  })

  it('sendToUser deletes a subscription when web-push reports 410 Gone', async () => {
    const subs = [{ _id: '1', endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } }]
    subscriptionModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(subs) })
    ;(webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 })
    const service = await makeService()

    await service.sendToUser('user_1', { title: 'Timer done', body: 'Pasta' })

    expect(subscriptionModel.deleteOne).toHaveBeenCalledWith({ _id: '1' })
  })

  it('sendToUser leaves the subscription alone on any other failure', async () => {
    const subs = [{ _id: '1', endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } }]
    subscriptionModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(subs) })
    ;(webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 })
    const service = await makeService()

    await service.sendToUser('user_1', { title: 'Timer done', body: 'Pasta' })

    expect(subscriptionModel.deleteOne).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest push.service.spec.ts`
Expected: FAIL — `Cannot find module './push.service'`.

- [ ] **Step 3: Write the PushService implementation**

```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as webpush from 'web-push'
import { PushSubscription, PushSubscriptionDocument } from './schemas/push-subscription.schema'

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
  deviceLabel?: string
}

@Injectable()
export class PushService {
  private vapidConfigured = false

  constructor(
    @InjectModel(PushSubscription.name) private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    private readonly config: ConfigService,
  ) {}

  // Lazy, like GeminiService's getClient() - configuring VAPID details at
  // construction time would throw in every test that instantiates this
  // service without real keys set. Throwing here instead means a missing
  // key only breaks the one call that actually needs it.
  private ensureVapidConfigured(): void {
    if (this.vapidConfigured) return
    const publicKey = this.getPublicKey()
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')
    if (!privateKey) throw new Error('VAPID_PRIVATE_KEY is not configured')
    webpush.setVapidDetails(this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@tugy.dev', publicKey, privateKey)
    this.vapidConfigured = true
  }

  getPublicKey(): string {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')
    if (!publicKey) throw new Error('VAPID_PUBLIC_KEY is not configured')
    return publicKey
  }

  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    await this.subscriptionModel
      .findOneAndUpdate({ endpoint: input.endpoint }, { ...input, userId }, { upsert: true })
      .exec()
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.subscriptionModel.deleteOne({ endpoint }).exec()
  }

  // Sends to every device this user has subscribed - never throws, since
  // the timer sweep (Task 3) must keep processing other due timers even if
  // one user's push happens to fail outright.
  async sendToUser(userId: string, payload: { title: string; body: string }): Promise<void> {
    this.ensureVapidConfigured()
    const subscriptions = await this.subscriptionModel.find({ userId }).exec()
    await Promise.all(subscriptions.map(sub => this.sendOne(sub, payload)))
  }

  private async sendOne(sub: PushSubscriptionDocument, payload: { title: string; body: string }): Promise<void> {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload))
    } catch (err) {
      // 410 Gone means the browser/OS has permanently invalidated this
      // subscription (uninstalled, permission revoked, etc.) - nothing will
      // ever succeed against it again, so it's dead weight to keep retrying.
      // Any other failure (network blip, transient FCM error) is left
      // alone; the next sweep cycle's retry is the recovery path for those.
      if ((err as { statusCode?: number }).statusCode === 410) {
        await this.subscriptionModel.deleteOne({ _id: sub._id }).exec()
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest push.service.spec.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Write the PushController**

```typescript
import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { PushService, PushSubscriptionInput } from './push.service'

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.pushService.getPublicKey() }
  }

  @Post('subscribe')
  async subscribe(@Body() body: PushSubscriptionInput, @Req() req: Request & { userId: string }) {
    await this.pushService.subscribe(req.userId, body)
    return { ok: true }
  }

  @Post('unsubscribe')
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.pushService.unsubscribe(body.endpoint)
    return { ok: true }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add api/src/timers/push.service.ts api/src/timers/push.service.spec.ts api/src/timers/push.controller.ts
git commit -m "feat: add PushService and PushController for VAPID push subscriptions"
```

---

### Task 3: TimersService (create/remove/sweep) + TimersController + module wiring

**Files:**
- Create: `api/src/timers/timers.service.ts`
- Create: `api/src/timers/timers.service.spec.ts`
- Create: `api/src/timers/timers.controller.ts`
- Create: `api/src/timers/timers.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `Timer`/`TimerDocument` from Task 1; `PushService` from Task 2.
- Produces: `TimersService` with `upsert(userId, clientId, recipeId, label, endsAt): Promise<void>`, `remove(userId, clientId): Promise<void>`, `sweepDueTimers(): Promise<void>`. `TimersController` at `/timers` with `POST` and `DELETE :clientId`. `TimersModule` exporting nothing further (self-contained feature module).

- [ ] **Step 1: Write the failing tests**

```typescript
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { TimersService } from './timers.service'
import { Timer } from './schemas/timer.schema'
import { PushService } from './push.service'

describe('TimersService', () => {
  const timerModel = {
    findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    find: jest.fn(),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
  }
  const pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TimersService,
        { provide: getModelToken(Timer.name), useValue: timerModel },
        { provide: PushService, useValue: pushService },
      ],
    }).compile()
    return moduleRef.get(TimersService)
  }

  it('upsert writes by (userId, clientId) with pushSent reset to false', async () => {
    const service = await makeService()
    await service.upsert('user_1', 'timer-1', 'recipe_1', 'Pasta', 12345)
    expect(timerModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', clientId: 'timer-1' },
      { userId: 'user_1', clientId: 'timer-1', recipeId: 'recipe_1', label: 'Pasta', endsAt: 12345, pushSent: false },
      { upsert: true },
    )
  })

  it('remove deletes by (userId, clientId)', async () => {
    const service = await makeService()
    await service.remove('user_1', 'timer-1')
    expect(timerModel.deleteOne).toHaveBeenCalledWith({ userId: 'user_1', clientId: 'timer-1' })
  })

  it('sweepDueTimers finds due unsent timers, sends a push per timer, and marks each pushSent', async () => {
    const due = [
      { _id: 'a', userId: 'user_1', clientId: 'timer-1', label: 'Pasta', endsAt: 1000, pushSent: false },
      { _id: 'b', userId: 'user_2', clientId: 'timer-2', label: 'Rice', endsAt: 2000, pushSent: false },
    ]
    timerModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(due) })
    const service = await makeService()

    await service.sweepDueTimers()

    expect(timerModel.find).toHaveBeenCalledWith({ endsAt: { $lte: expect.any(Number) }, pushSent: false })
    expect(pushService.sendToUser).toHaveBeenCalledWith('user_1', { title: 'Timer done', body: 'Pasta' })
    expect(pushService.sendToUser).toHaveBeenCalledWith('user_2', { title: 'Timer done', body: 'Rice' })
    expect(timerModel.updateOne).toHaveBeenCalledWith({ _id: 'a' }, { $set: { pushSent: true } })
    expect(timerModel.updateOne).toHaveBeenCalledWith({ _id: 'b' }, { $set: { pushSent: true } })
  })

  it('sweepDueTimers does nothing when no timers are due', async () => {
    timerModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService()

    await service.sweepDueTimers()

    expect(pushService.sendToUser).not.toHaveBeenCalled()
    expect(timerModel.updateOne).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest timers.service.spec.ts`
Expected: FAIL — `Cannot find module './timers.service'`.

- [ ] **Step 3: Write the TimersService implementation**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Timer, TimerDocument } from './schemas/timer.schema'
import { PushService } from './push.service'

const SWEEP_INTERVAL_MS = 5000

@Injectable()
export class TimersService implements OnModuleInit {
  constructor(
    @InjectModel(Timer.name) private readonly timerModel: Model<TimerDocument>,
    private readonly pushService: PushService,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.sweepDueTimers().catch(() => { /* transient failure - the next tick retries */ })
    }, SWEEP_INTERVAL_MS)
  }

  async upsert(userId: string, clientId: string, recipeId: string, label: string, endsAt: number): Promise<void> {
    await this.timerModel
      .findOneAndUpdate(
        { userId, clientId },
        { userId, clientId, recipeId, label, endsAt, pushSent: false },
        { upsert: true },
      )
      .exec()
  }

  async remove(userId: string, clientId: string): Promise<void> {
    await this.timerModel.deleteOne({ userId, clientId }).exec()
  }

  // Finds every timer whose endsAt has passed but hasn't been pushed yet,
  // sends one push per timer (not batched per user) so each notification
  // carries that timer's own label, then marks it sent. A few seconds of
  // slack past endsAt is expected and accepted - see the design doc.
  async sweepDueTimers(): Promise<void> {
    const due = await this.timerModel.find({ endsAt: { $lte: Date.now() }, pushSent: false }).exec()
    for (const timer of due) {
      await this.pushService.sendToUser(timer.userId, { title: 'Timer done', body: timer.label })
      await this.timerModel.updateOne({ _id: timer._id }, { $set: { pushSent: true } }).exec()
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest timers.service.spec.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Write the TimersController**

```typescript
import { Body, Controller, Delete, Param, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { TimersService } from './timers.service'

interface CreateTimerBody {
  clientId: string
  recipeId: string
  label: string
  endsAt: number
}

@Controller('timers')
export class TimersController {
  constructor(private readonly timersService: TimersService) {}

  @Post()
  async create(@Body() body: CreateTimerBody, @Req() req: Request & { userId: string }) {
    await this.timersService.upsert(req.userId, body.clientId, body.recipeId, body.label, body.endsAt)
    return { ok: true }
  }

  @Delete(':clientId')
  async remove(@Param('clientId') clientId: string, @Req() req: Request & { userId: string }) {
    await this.timersService.remove(req.userId, clientId)
    return { ok: true }
  }
}
```

- [ ] **Step 6: Write the TimersModule**

```typescript
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Timer, TimerSchema } from './schemas/timer.schema'
import { PushSubscription, PushSubscriptionSchema } from './schemas/push-subscription.schema'
import { TimersService } from './timers.service'
import { TimersController } from './timers.controller'
import { PushService } from './push.service'
import { PushController } from './push.controller'

@Module({
  imports: [MongooseModule.forFeature([
    { name: Timer.name, schema: TimerSchema },
    { name: PushSubscription.name, schema: PushSubscriptionSchema },
  ])],
  providers: [TimersService, PushService],
  controllers: [TimersController, PushController],
})
export class TimersModule {}
```

- [ ] **Step 7: Wire TimersModule into AppModule**

In `api/src/app.module.ts`, add the import:

```typescript
import { TimersModule } from './timers/timers.module'
```

And add `TimersModule` to the `imports` array (after `NotificationsModule`):

```typescript
    NotificationsModule,
    TimersModule,
```

- [ ] **Step 8: Run the full backend test suite**

Run: `cd api && npx jest`
Expected: PASS, all suites green (existing count plus 10 new tests from this feature).

- [ ] **Step 9: Verify build**

Run: `cd api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add api/src/timers/timers.service.ts api/src/timers/timers.service.spec.ts api/src/timers/timers.controller.ts api/src/timers/timers.module.ts api/src/app.module.ts
git commit -m "feat: add TimersService with due-timer sweep, TimersController, wire TimersModule"
```

---

### Task 4: Frontend push helper (src/lib/push.ts)

**Files:**
- Create: `src/lib/push.ts`

**Interfaces:**
- Consumes: `apiFetch` from `src/lib/api.ts` (existing).
- Produces: `ensurePushSubscription(getToken: () => Promise<string | null>): Promise<void>`, `syncTimerStart(getToken, clientId: string, recipeId: string, label: string, endsAt: number): Promise<void>`, `syncTimerRemoved(getToken, clientId: string): Promise<void>`. All consumed by Task 6.

- [ ] **Step 1: Write the helper module**

```typescript
import { apiFetch } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)))
}

// Requests Notification permission (only if not already decided) and
// registers a push subscription if granted - called from useTimers.ts's
// addTimer() so ANY timer (cook-mode or standalone) can alert while the
// app is backgrounded. Never throws - denied/unsupported/network failure
// all just mean "no background push," never a broken timer.
export async function ensurePushSubscription(getToken: () => Promise<string | null>): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
    }
    if (Notification.permission !== 'granted') return

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      const { publicKey } = await apiFetch<{ publicKey: string }>('/push/vapid-public-key', getToken)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    const token = await getToken()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(subscription.toJSON()),
    })
  } catch {
    // Any failure here (permission API missing, subscribe rejected, network
    // error) just means no background push - never blocks or breaks the
    // timer that triggered this call.
  }
}

export async function syncTimerStart(
  getToken: () => Promise<string | null>,
  clientId: string,
  recipeId: string,
  label: string,
  endsAt: number,
): Promise<void> {
  try {
    const token = await getToken()
    await fetch('/api/timers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clientId, recipeId, label, endsAt }),
    })
  } catch {
    // Fire-and-forget - a failed sync just means no background push for
    // this specific timer, the local countdown/sound is unaffected.
  }
}

export async function syncTimerRemoved(getToken: () => Promise<string | null>, clientId: string): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/timers/${clientId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // Fire-and-forget - worst case a stale row lingers until the next
    // successful sync overwrites or removes it.
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/push.ts
git commit -m "feat: add frontend push subscription and timer-sync helpers"
```

---

### Task 5: Service worker push + notificationclick handlers

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Add the push and notificationclick handlers**

In `public/sw.js`, insert this block immediately after the `activate` listener (before `async function networkFirst`):

```javascript
self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: 'Timer done', body: event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Timer done', {
      body: payload.body,
      icon: '/favicon.png',
      tag: 'timer-done',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => 'focus' in c)
      if (existing) return existing.focus()
      return self.clients.openWindow('/')
    })
  )
})
```

- [ ] **Step 2: Verify syntax**

Run: `node --check public/sw.js`
Expected: no output (syntax OK).

- [ ] **Step 3: Bump the shell cache version**

Per this file's own convention ("bump the cache names whenever the caching strategy changes"), and since existing installed service workers need to pick up these new handlers promptly:

In `public/sw.js`, change:
```javascript
const SHELL_CACHE = 'shell-v2'
```
to:
```javascript
const SHELL_CACHE = 'shell-v3'
```

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat: add push and notificationclick handlers to the service worker"
```

---

### Task 6: Wire useTimers.ts to sync with the backend

**Files:**
- Modify: `src/hooks/useTimers.ts` (full file replacement)

**Interfaces:**
- Consumes: `ensurePushSubscription`, `syncTimerStart`, `syncTimerRemoved` from Task 4 (`src/lib/push.ts`).

- [ ] **Step 1: Replace the full file content**

Replace all of `src/hooks/useTimers.ts` with:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import type { TimerState } from '../types'
import { ensurePushSubscription, syncTimerStart, syncTimerRemoved } from '../lib/push'

const SESSION_KEY = 'recipe-timers'
let timerIdCounter = 0

function saveTimers(timers: TimerState[]) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(timers))
  } catch { /* localStorage unavailable */ }
}

// Recompute remaining/done from wall-clock time (endsAt) rather than trusting
// a stored countdown - background tabs/PWAs get throttled or fully suspended,
// so a plain per-tick decrement understates how much time actually passed.
function resolveTimer(t: TimerState): TimerState {
  if (t.done || !t.running) return t
  const endsAt = t.endsAt ?? (Date.now() + t.remainingSeconds * 1000)
  const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  const done = remaining === 0
  return { ...t, remainingSeconds: remaining, done, running: !done, endsAt }
}

function loadTimers(): TimerState[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as TimerState[]).map(resolveTimer)
  } catch { return [] }
}

export function useTimers() {
  const { getToken } = useAuth()
  const [timers, setTimers] = useState<TimerState[]>(loadTimers)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const tick = useCallback((id: string) => {
    setTimers(prev => {
      const next = prev.map(t => {
        if (t.id !== id || !t.running) return t
        const resolved = resolveTimer(t)
        if (resolved.done) {
          clearInterval(intervalsRef.current.get(id))
          intervalsRef.current.delete(id)
          // Natural completion, seen in the foreground - delete the
          // server-side row so the sweep never sends a redundant push for
          // a timer the owner has already watched finish.
          void syncTimerRemoved(getToken, id)
        }
        return resolved
      })
      saveTimers(next)
      return next
    })
  }, [getToken])

  // Restart intervals for timers that were running when restored from session
  useEffect(() => {
    timers.forEach(t => {
      if (t.running && !t.done && !intervalsRef.current.has(t.id)) {
        const interval = setInterval(() => tick(t.id), 1000)
        intervalsRef.current.set(t.id, interval)
        // Update counter to avoid ID collisions
        const num = parseInt(t.id.replace('timer-', ''), 10)
        if (!isNaN(num) && num > timerIdCounter) timerIdCounter = num
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A backgrounded/suspended tab's setInterval may not fire at all until the
  // tab is foregrounded again - resync from wall-clock time the instant it is,
  // rather than waiting for the next 1s tick.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      setTimers(prev => {
        const next = prev.map(resolveTimer)
        saveTimers(next)
        return next
      })
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const addTimer = useCallback((label: string, minutes: number, recipeId: string, stepIndex: number) => {
    const id = `timer-${++timerIdCounter}`
    const totalSeconds = minutes * 60
    const endsAt = Date.now() + totalSeconds * 1000
    setTimers(prev => {
      const next = [...prev, {
        id, label, totalSeconds, remainingSeconds: totalSeconds,
        running: true, done: false, recipeId, stepIndex,
        endsAt,
      }]
      saveTimers(next)
      return next
    })
    const interval = setInterval(() => tick(id), 1000)
    intervalsRef.current.set(id, interval)
    // Fire-and-forget, same tolerance-for-failure posture as this app's
    // activityLog.record() calls - a denied permission or failed sync just
    // means no background push for this timer, never a broken timer.
    void ensurePushSubscription(getToken).then(() => syncTimerStart(getToken, id, recipeId, label, endsAt))
  }, [tick, getToken])

  const toggleTimer = useCallback((id: string) => {
    setTimers(prev => {
      const next = prev.map(t => {
        if (t.id !== id || t.done) return t
        if (t.running) {
          clearInterval(intervalsRef.current.get(id))
          intervalsRef.current.delete(id)
          const resolved = resolveTimer(t)
          // Paused - there's no valid endsAt to sweep for anymore, so the
          // server-side row (if any) must go too, or the sweep would fire
          // a push for a timer the owner deliberately stopped.
          void syncTimerRemoved(getToken, id)
          return { ...resolved, running: false, endsAt: undefined }
        } else {
          const interval = setInterval(() => tick(id), 1000)
          intervalsRef.current.set(id, interval)
          const endsAt = Date.now() + t.remainingSeconds * 1000
          void syncTimerStart(getToken, id, t.recipeId, t.label, endsAt)
          return { ...t, running: true, endsAt }
        }
      })
      saveTimers(next)
      return next
    })
  }, [tick, getToken])

  const removeTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    void syncTimerRemoved(getToken, id)
    setTimers(prev => {
      const next = prev.filter(t => t.id !== id)
      saveTimers(next)
      return next
    })
  }, [getToken])

  const resetTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    void syncTimerRemoved(getToken, id)
    setTimers(prev => {
      const next = prev.map(t =>
        t.id !== id ? t : { ...t, remainingSeconds: t.totalSeconds, running: false, done: false, endsAt: undefined }
      )
      saveTimers(next)
      return next
    })
  }, [getToken])

  useEffect(() => {
    const intervals = intervalsRef.current
    return () => { intervals.forEach(i => clearInterval(i)) }
  }, [])

  return { timers, addTimer, toggleTimer, removeTimer, resetTimer }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Run lint**

Run: `npx eslint src/hooks/useTimers.ts src/lib/push.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTimers.ts
git commit -m "feat: sync timer lifecycle to the backend for push notifications"
```

---

### Task 7: Generate VAPID keys, deploy, manual verification

**Files:** none (deployment + verification only)

- [ ] **Step 1: Generate a VAPID key pair**

Run: `cd api && node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys(), null, 2))"`
Expected: prints `{ "publicKey": "...", "privateKey": "..." }`. Save both values.

- [ ] **Step 2: Add VAPID env vars to the server repo's secrets for recipes-api**

In the `server` repo (wherever `recipes-api`'s other secrets like `GEMINI_API_KEY` are set — check `/Users/tugy/git/server` for the existing SealedSecret/env pattern for `recipes-api`), add:
- `VAPID_PUBLIC_KEY` = the public key from Step 1
- `VAPID_PRIVATE_KEY` = the private key from Step 1
- `VAPID_SUBJECT` = `mailto:admin@tugy.dev` (or whatever contact address is already used elsewhere in this deployment)

Follow the same sealing/apply process already used for this app's other secrets.

- [ ] **Step 3: Run the full backend test suite one more time**

Run: `cd api && npx jest`
Expected: PASS, all suites green.

- [ ] **Step 4: Run the frontend build**

Run: `npm run build`
Expected: PASS, no errors.

- [ ] **Step 5: Push to main**

```bash
git push
```

Watch CI on both the `recipes` repo and the triggered `server` repo deploy workflow, then confirm the running pod's image tag matches the pushed commit SHA (`kubectl -n apps get pods -l app=recipes-api -o jsonpath='{.items[*].spec.containers[*].image}'` and the `recipes` frontend pod equivalent) — this session's established two-stage verification pattern.

- [ ] **Step 6: Manual verification**

On a real Android device (per the design's TWA/Android focus):
1. Start any timer (a standalone step timer or a cook-mode one). Confirm the browser's permission prompt appears (or subscribes silently if already granted).
2. Background the app (switch to another app or lock the screen) before the timer finishes.
3. Confirm a push notification arrives within a few seconds of the timer's actual end time.
4. Tap the notification — confirm it focuses/opens the app.
5. Start a timer, then cancel/pause it before it finishes. Confirm NO push arrives at the original end time.
6. Deny notification permission (or test on a browser where `Notification`/`PushManager` are unavailable) and confirm timers still work exactly as before — sound plays in foreground, no crash, no blocking.
7. If a second device/browser is available and also granted permission, confirm it also receives the push for a timer started from the first device (multi-device fan-out).

---

## Deployment

Covered in Task 7. This repo deploys via GitHub Actions on push to `main` (see root `CLAUDE.md`).
