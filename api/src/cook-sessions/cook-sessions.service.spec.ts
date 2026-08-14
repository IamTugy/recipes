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
