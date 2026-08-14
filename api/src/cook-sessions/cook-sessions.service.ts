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

  async logStep(sessionId: string, userId: string, stepKey: string, stepNum: number): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return

    session.events.push({ stepKey, stepNum, enteredAt: new Date().toISOString() })
    const client = this.redis.getClient()
    await client.set(redisKey(sessionId), JSON.stringify(session))
    await client.expire(redisKey(sessionId), SESSION_TTL_SECONDS)
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

    await this.redis.getClient().del(redisKey(sessionId))
  }

  async abandonSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.readSession(sessionId)
    if (!session || session.userId !== userId) return
    await this.redis.getClient().del(redisKey(sessionId))
  }
}
