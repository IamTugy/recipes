import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { randomUUID } from 'crypto'
import { CookSession, CookSessionDocument } from './schemas/cook-session.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
import { RedisService } from '../redis/redis.service'
import { CookLogService } from '../cook-log/cook-log.service'

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

export interface CurrentCookSessionView {
  sessionId: string
  recipeId: string
  recipeTitle: string
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

// Points at whichever session the user is *currently* cooking, if any -
// unlike activeIndexKey (scoped to one recipe), this is scoped to the
// user alone, which is what makes it possible to detect a conflict when
// they try to start a DIFFERENT recipe while already cooking one.
function currentPointerKey(userId: string): string {
  return `cook-session-current:${userId}`
}

@Injectable()
export class CookSessionsService {
  private readonly logger = new Logger(CookSessionsService.name)

  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly redis: RedisService,
    private readonly cookLogService: CookLogService,
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
    const recipe = await this.recipeModel.findOne({ _id: recipeId }).exec()
    const pointer: CurrentCookSessionView = { sessionId, recipeId, recipeTitle: recipe?.title ?? '' }

    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session), 'EX', SESSION_TTL_SECONDS)
    await client.set(activeIndexKey(userId, recipeId), sessionId, 'EX', SESSION_TTL_SECONDS)
    await client.set(currentPointerKey(userId), JSON.stringify(pointer), 'EX', SESSION_TTL_SECONDS)
    return sessionId
  }

  private async readSession(sessionId: string): Promise<RedisSession | null> {
    const raw = await this.redis.getClient().get(redisKey(sessionId))
    if (!raw) return null
    return JSON.parse(raw) as RedisSession
  }

  async logStep(
    sessionId: string,
    userId: string,
    stepKey: string,
    stepNum: number,
    checkedSteps: string[],
    checkedIngredients: string[],
  ): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    session.events.push({ stepKey, stepNum, enteredAt: new Date().toISOString() })
    session.currentStepKey = stepKey
    session.currentStepNum = stepNum
    session.checkedSteps = checkedSteps
    session.checkedIngredients = checkedIngredients
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

  async getCurrentSession(userId: string): Promise<CurrentCookSessionView | null> {
    const raw = await this.redis.getClient().get(currentPointerKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as CurrentCookSessionView
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
}
