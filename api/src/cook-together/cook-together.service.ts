import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common'
import { randomInt, randomUUID } from 'crypto'
import { RedisService } from '../redis/redis.service'
import { RecipesService } from '../recipes/recipes.service'
import { UsersService } from '../users/users.service'
import { CookLogService } from '../cook-log/cook-log.service'
import { CookTogetherPlanner } from './cook-together-planner.service'
import { buildTasks, PlanStepGroup } from './cook-together.plan'
import { assignPending, computeProgress, taskEstimate } from './cook-together.schedule'
import { CookTogetherRoom, CookTogetherTask, CookTogetherView } from './cook-together.types'

const ROOM_TTL_SECONDS = 86400
// A finished room stays readable for a while so every participant's screen
// gets to show the "all done" summary before it disappears.
const FINISHED_ROOM_TTL_SECONDS = 3600
const MAX_PARTICIPANTS = 8
const LOCK_TTL_MS = 10_000
const LOCK_RETRY_DELAY_MS = 40
const LOCK_MAX_ATTEMPTS = 100
// No 0/O/1/I/L - codes get read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const CODE_PATTERN = /^[A-Z0-9]{6}$/

const RELEASE_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`

function roomKey(code: string): string {
  return `cook-together:${code}`
}

function lockKey(code: string): string {
  return `cook-together-lock:${code}`
}

// Which room a user is currently in - what lets a reloaded page (or another
// device) find its way back without knowing the join code.
function pointerKey(userId: string): string {
  return `cook-together-current:${userId}`
}

export interface CookTogetherMutation {
  view: CookTogetherView
  // Set only on the call that actually completed the cook.
  finished?: { participantIds: string[]; recipeId: string; durationMinutes: number }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

@Injectable()
export class CookTogetherService {
  private readonly logger = new Logger(CookTogetherService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly recipesService: RecipesService,
    private readonly usersService: UsersService,
    private readonly cookLogService: CookLogService,
    private readonly planner: CookTogetherPlanner,
  ) {}

  // ---- reads ----

  async getRoom(code: string, userId: string): Promise<CookTogetherView> {
    const room = await this.readRoom(code)
    this.requireParticipant(room, userId)
    return this.toView(room, userId)
  }

  async getCurrent(userId: string): Promise<CookTogetherView | null> {
    const code = await this.redis.getClient().get(pointerKey(userId))
    if (!code) return null
    const room = await this.tryReadRoom(code)
    if (!room || !room.participants.some(p => p.userId === userId)) {
      await this.redis.getClient().del(pointerKey(userId))
      return null
    }
    return this.toView(room, userId)
  }

  // ---- room lifecycle ----

  async create(userId: string, recipeId: string): Promise<CookTogetherView> {
    const recipe = await this.recipesService.findByIdForUser(recipeId, userId, false) as unknown as
      { id: string; title: string; titleHe?: string; steps?: PlanStepGroup[] } | null
    if (!recipe) throw new NotFoundException('Recipe not found')
    const tasks = buildTasks(recipe.steps ?? [])
    if (tasks.length === 0) throw new BadRequestException('This recipe has no steps to split')

    const now = new Date().toISOString()
    const room: CookTogetherRoom = {
      code: '',
      recipeId,
      recipeTitle: recipe.title,
      recipeTitleHe: recipe.titleHe,
      hostId: userId,
      status: 'lobby',
      createdAt: now,
      participants: [await this.newParticipant(userId, now)],
      tasks,
      planSource: null,
    }
    room.code = await this.reserveCode(room)
    await this.leaveCurrentRoom(userId, room.code)
    await this.redis.getClient().set(pointerKey(userId), room.code, 'EX', ROOM_TTL_SECONDS)
    return this.toView(room, userId)
  }

  async join(code: string, userId: string): Promise<CookTogetherView> {
    const normalized = this.normalizeCode(code)
    const existing = await this.tryReadRoom(normalized)
    if (!existing) throw new NotFoundException('Cook-together room not found')
    const participant = await this.newParticipant(userId, new Date().toISOString())

    const { room } = await this.mutate(normalized, current => {
      if (current.participants.some(p => p.userId === userId)) return
      if (current.status === 'finished') throw new BadRequestException('This cook is already finished')
      if (current.participants.length >= MAX_PARTICIPANTS) {
        throw new ConflictException(`A cook-together room holds at most ${MAX_PARTICIPANTS} people`)
      }
      current.participants.push(participant)
      // Someone arriving mid-cook gets a fair share of what's still to do.
      if (current.status === 'cooking') this.rebalance(current)
    })
    // Only once the join succeeded, so a full room doesn't kick them out of
    // the one they're already in.
    await this.leaveCurrentRoom(userId, normalized)
    await this.redis.getClient().set(pointerKey(userId), normalized, 'EX', ROOM_TTL_SECONDS)
    return this.toView(room, userId)
  }

  async leave(code: string, userId: string): Promise<void> {
    const normalized = this.normalizeCode(code)
    await this.leaveRoom(normalized, userId)
  }

  // Host only. The one call that can take a while (it asks the AI to split
  // the work), so the model call happens outside the room lock and its result
  // is merged in under the lock, re-checking that nothing changed meanwhile.
  async start(code: string, userId: string): Promise<CookTogetherView> {
    const normalized = this.normalizeCode(code)
    const snapshot = await this.readRoom(normalized)
    this.requireHost(snapshot, userId)
    if (snapshot.status !== 'lobby') throw new BadRequestException('This cook has already started')

    const plan = await this.planner.plan(
      snapshot.recipeTitle,
      snapshot.tasks,
      snapshot.participants.map(p => p.userId),
    )

    const { room } = await this.mutate(normalized, current => {
      this.requireHost(current, userId)
      if (current.status !== 'lobby') throw new BadRequestException('This cook has already started')
      current.tasks = plan.tasks
      current.planSource = plan.source
      current.status = 'cooking'
      current.startedAt = new Date().toISOString()
      // People who left, or joined, while the plan was being made.
      const ids = current.participants.map(p => p.userId)
      for (const task of current.tasks) {
        if (task.assigneeId && !ids.includes(task.assigneeId)) task.assigneeId = null
      }
      assignPending(current.tasks, ids, Date.now(), false)
    })
    return this.toView(room, userId)
  }

  // Host only - re-split whatever hasn't been started yet (e.g. after
  // things went differently than planned). Never touches finished or
  // in-progress tasks.
  async resplit(code: string, userId: string): Promise<CookTogetherView> {
    const { room } = await this.mutate(this.normalizeCode(code), current => {
      this.requireHost(current, userId)
      this.requireCooking(current)
      this.rebalance(current)
    })
    return this.toView(room, userId)
  }

  // Host only. Ends the session for everyone as finished - used when the
  // group is done but didn't tick off every step.
  async finish(code: string, userId: string): Promise<CookTogetherMutation> {
    return this.mutateWithFinish(this.normalizeCode(code), current => {
      this.requireHost(current, userId)
      this.requireCooking(current)
    }, userId, true)
  }

  // Host only. Throws the whole room away.
  async cancel(code: string, userId: string): Promise<void> {
    const normalized = this.normalizeCode(code)
    await this.withLock(normalized, async () => {
      const room = await this.readRoom(normalized)
      this.requireHost(room, userId)
      const client = this.redis.getClient()
      await client.del(roomKey(normalized))
      for (const p of room.participants) await this.clearPointer(p.userId, normalized)
    })
  }

  // ---- tasks ----

  // Takes a task for yourself without starting it (e.g. to grab one that's
  // currently someone else's while they're busy).
  async claimTask(code: string, userId: string, taskId: string): Promise<CookTogetherView> {
    const { room } = await this.mutate(this.normalizeCode(code), current => {
      this.requireParticipant(current, userId)
      this.requireCooking(current)
      const task = this.findTask(current, taskId)
      if (task.status !== 'pending') throw new BadRequestException('Only a task that has not started can be taken over')
      task.assigneeId = userId
    })
    return this.toView(room, userId)
  }

  async startTask(code: string, userId: string, taskId: string): Promise<CookTogetherView> {
    const { room } = await this.mutate(this.normalizeCode(code), current => {
      this.requireParticipant(current, userId)
      this.requireCooking(current)
      const task = this.findTask(current, taskId)
      if (task.status === 'done') throw new BadRequestException('This task is already done')
      if (task.status === 'in_progress') {
        if (task.assigneeId === userId) return
        throw new ConflictException('Someone else is already working on this task')
      }
      task.assigneeId = userId
      task.status = 'in_progress'
      task.startedAt = new Date().toISOString()
    })
    return this.toView(room, userId)
  }

  async completeTask(code: string, userId: string, taskId: string): Promise<CookTogetherMutation> {
    return this.mutateWithFinish(this.normalizeCode(code), current => {
      this.requireParticipant(current, userId)
      this.requireCooking(current)
      const task = this.findTask(current, taskId)
      if (task.status === 'done') return
      if (task.assigneeId && task.assigneeId !== userId && current.hostId !== userId) {
        throw new ForbiddenException('Only the person doing this task (or the host) can complete it')
      }
      // startedAt is deliberately left unset when the task was never started:
      // a zero-length "duration" would make the group look impossibly fast in
      // the live estimate.
      task.assigneeId = task.assigneeId ?? userId
      task.status = 'done'
      task.completedAt = new Date().toISOString()
      task.completedBy = userId
      if (current.tasks.every(t => t.status === 'done')) this.markFinished(current)
    }, userId, false)
  }

  // Undo an accidental "done".
  async reopenTask(code: string, userId: string, taskId: string): Promise<CookTogetherView> {
    const { room } = await this.mutate(this.normalizeCode(code), current => {
      this.requireParticipant(current, userId)
      this.requireCooking(current)
      const task = this.findTask(current, taskId)
      if (task.status !== 'done') return
      if (task.assigneeId !== userId && task.completedBy !== userId && current.hostId !== userId) {
        throw new ForbiddenException('Only the person who did this task (or the host) can reopen it')
      }
      task.status = 'pending'
      task.startedAt = undefined
      task.completedAt = undefined
      task.completedBy = undefined
    })
    return this.toView(room, userId)
  }

  // ---- internals ----

  private normalizeCode(code: string): string {
    const normalized = (code ?? '').trim().toUpperCase()
    if (!CODE_PATTERN.test(normalized)) throw new NotFoundException('Cook-together room not found')
    return normalized
  }

  private async tryReadRoom(code: string): Promise<CookTogetherRoom | null> {
    const raw = await this.redis.getClient().get(roomKey(code))
    return raw ? (JSON.parse(raw) as CookTogetherRoom) : null
  }

  private async readRoom(code: string): Promise<CookTogetherRoom> {
    const room = await this.tryReadRoom(code)
    if (!room) throw new NotFoundException('Cook-together room not found')
    return room
  }

  private async saveRoom(room: CookTogetherRoom): Promise<void> {
    const ttl = room.status === 'finished' ? FINISHED_ROOM_TTL_SECONDS : ROOM_TTL_SECONDS
    await this.redis.getClient().set(roomKey(room.code), JSON.stringify(room), 'EX', ttl)
  }

  // Picks an unused code and stores the room under it in one atomic SET NX,
  // so two simultaneous creates can never end up sharing a code.
  private async reserveCode(room: CookTogetherRoom): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = ''
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
      const reserved = await this.redis.getClient().set(
        roomKey(code), JSON.stringify({ ...room, code }), 'EX', ROOM_TTL_SECONDS, 'NX',
      )
      if (reserved === 'OK') return code
    }
    throw new ConflictException('Could not allocate a room code, please try again')
  }

  private async newParticipant(userId: string, joinedAt: string) {
    let profile: { name?: string; imageUrl?: string } | undefined
    try {
      profile = (await this.usersService.profilesByIds([userId]))[userId]
    } catch (err) {
      // A missing display name must never block cooking together.
      this.logger.error(`Failed to look up profile for ${userId}`, err instanceof Error ? err.stack : err)
    }
    return { userId, name: profile?.name, imageUrl: profile?.imageUrl, joinedAt }
  }

  // Serialises read-modify-write cycles on one room: several people tapping
  // "done" at the same moment must not overwrite each other.
  private async withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const client = this.redis.getClient()
    const token = randomUUID()
    let acquired = false
    for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS && !acquired; attempt++) {
      acquired = (await client.set(lockKey(code), token, 'PX', LOCK_TTL_MS, 'NX')) === 'OK'
      if (!acquired) await sleep(LOCK_RETRY_DELAY_MS)
    }
    if (!acquired) throw new ConflictException('The room is busy, please try again')
    try {
      return await fn()
    } finally {
      await client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey(code), token)
    }
  }

  private async mutate(
    code: string,
    fn: (room: CookTogetherRoom) => void,
  ): Promise<{ room: CookTogetherRoom }> {
    return this.withLock(code, async () => {
      const room = await this.readRoom(code)
      fn(room)
      await this.saveRoom(room)
      return { room }
    })
  }

  private async mutateWithFinish(
    code: string,
    fn: (room: CookTogetherRoom) => void,
    userId: string,
    forceFinish: boolean,
  ): Promise<CookTogetherMutation> {
    const { room, justFinished } = await this.withLock(code, async () => {
      const current = await this.readRoom(code)
      const before = current.status
      fn(current)
      if (forceFinish && current.status !== 'finished') this.markFinished(current)
      await this.saveRoom(current)
      return { room: current, justFinished: before !== 'finished' && current.status === 'finished' }
    })
    const view = this.toView(room, userId)
    if (!justFinished) return { view }

    const participantIds = room.participants.map(p => p.userId)
    for (const id of participantIds) {
      await this.redis.getClient().expire(pointerKey(id), FINISHED_ROOM_TTL_SECONDS)
    }
    // Everyone who cooked counts as having cooked the recipe (recordCook
    // never throws and applies its own repeat-cook cooldown).
    await Promise.all(participantIds.map(id => this.cookLogService.recordCook(id, room.recipeId)))
    const durationMinutes = room.startedAt && room.finishedAt
      ? Math.round((new Date(room.finishedAt).getTime() - new Date(room.startedAt).getTime()) / 60000)
      : 0
    return { view, finished: { participantIds, recipeId: room.recipeId, durationMinutes } }
  }

  private markFinished(room: CookTogetherRoom): void {
    room.status = 'finished'
    room.finishedAt = new Date().toISOString()
  }

  private rebalance(room: CookTogetherRoom): void {
    assignPending(room.tasks, room.participants.map(p => p.userId), Date.now())
  }

  private async leaveCurrentRoom(userId: string, exceptCode?: string): Promise<void> {
    const code = await this.redis.getClient().get(pointerKey(userId))
    if (!code || code === exceptCode) return
    try {
      await this.leaveRoom(code, userId)
    } catch (err) {
      // The old room being gone or unreachable must not block starting a new
      // one - just drop the stale pointer.
      if (!(err instanceof NotFoundException)) {
        this.logger.error(`Failed to leave old room ${code} for ${userId}`, err instanceof Error ? err.stack : err)
      }
      await this.clearPointer(userId, code)
    }
  }

  private async leaveRoom(code: string, userId: string): Promise<void> {
    await this.withLock(code, async () => {
      const room = await this.tryReadRoom(code)
      if (!room || !room.participants.some(p => p.userId === userId)) {
        await this.clearPointer(userId, code)
        return
      }
      room.participants = room.participants.filter(p => p.userId !== userId)
      if (room.participants.length === 0) {
        await this.redis.getClient().del(roomKey(code))
        await this.clearPointer(userId, code)
        return
      }
      if (room.hostId === userId) room.hostId = room.participants[0].userId
      if (room.status === 'cooking') {
        // Whatever they were holding goes back into the pool for the others.
        for (const task of room.tasks) {
          if (task.assigneeId !== userId || task.status === 'done') continue
          task.assigneeId = null
          task.status = 'pending'
          task.startedAt = undefined
        }
        this.rebalance(room)
      }
      await this.saveRoom(room)
      await this.clearPointer(userId, code)
    })
  }

  private async clearPointer(userId: string, code: string): Promise<void> {
    const client = this.redis.getClient()
    // Only clear if it still points here - the user may have moved on to another room.
    if ((await client.get(pointerKey(userId))) === code) await client.del(pointerKey(userId))
  }

  private requireParticipant(room: CookTogetherRoom, userId: string): void {
    if (!room.participants.some(p => p.userId === userId)) {
      throw new ForbiddenException('You are not part of this cook-together room')
    }
  }

  private requireHost(room: CookTogetherRoom, userId: string): void {
    this.requireParticipant(room, userId)
    if (room.hostId !== userId) throw new ForbiddenException('Only the host can do that')
  }

  private requireCooking(room: CookTogetherRoom): void {
    if (room.status !== 'cooking') throw new BadRequestException('This cook is not in progress')
  }

  private findTask(room: CookTogetherRoom, taskId: string): CookTogetherTask {
    const task = room.tasks.find(t => t.id === taskId)
    if (!task) throw new NotFoundException('Task not found')
    return task
  }

  private toView(room: CookTogetherRoom, viewerId: string): CookTogetherView {
    return {
      ...room,
      viewerId,
      tasks: room.tasks.map(t => ({ ...t, estimatedMinutes: taskEstimate(t) })),
      progress: computeProgress(room, Date.now()),
    }
  }
}
