import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookSessionsService } from './cook-sessions.service'
import { CookSession } from './schemas/cook-session.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'
import { RedisService } from '../redis/redis.service'
import { CookLogService } from '../cook-log/cook-log.service'

describe('CookSessionsService', () => {
  const get = jest.fn()
  const set = jest.fn()
  const expire = jest.fn()
  const del = jest.fn()
  const redisClient = { get, set, expire, del }
  const redisService = { getClient: () => redisClient }
  const create = jest.fn()
  const model = { create }
  const recordCook = jest.fn()
  const cookLogService = { recordCook }
  const recipeFindOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
  const recipeModel = { findOne: recipeFindOne }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookSessionsService,
        { provide: getModelToken(CookSession.name), useValue: model },
        { provide: RedisService, useValue: redisService },
        { provide: CookLogService, useValue: cookLogService },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
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
    await service.logStep('session_1', 'user_1', '0-0', 1, ['prior-step'], ['ing-1'])

    expect(set).toHaveBeenCalledWith(
      'cook-session:session_1',
      expect.stringContaining('"stepKey":"0-0"'),
      'EX',
      86400,
    )
    const [, valueJson] = set.mock.calls[0]
    const written = JSON.parse(valueJson)
    expect(written.currentStepKey).toBe('0-0')
    expect(written.currentStepNum).toBe(1)
    expect(written.checkedSteps).toEqual(['prior-step'])
    expect(written.checkedIngredients).toEqual(['ing-1'])
    expect(expire).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a', 86400)
  })

  it('logStep silently no-ops when the caller does not own the session', async () => {
    const existing = {
      userId: 'owner_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [], currentStepKey: null, currentStepNum: 0, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    const service = await makeService()
    await service.logStep('session_1', 'attacker_1', '0-0', 1, [], [])
    expect(set).not.toHaveBeenCalled()
  })

  it('logStep on a missing Redis key silently no-ops', async () => {
    get.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.logStep('gone', 'user_1', '0-0', 1, [], [])).resolves.toBeUndefined()
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
    expect(recordCook).toHaveBeenCalledWith('user_1', 'recipe_a')
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

  it('finishSession still deletes both Redis keys even if recordCook rejects', async () => {
    const existing = {
      userId: 'user_1', recipeId: 'recipe_a', startedAt: '2026-08-14T10:00:00.000Z',
      events: [{ stepKey: '0-0', stepNum: 1, enteredAt: '2026-08-14T10:00:30.000Z' }],
      currentStepKey: '0-0', currentStepNum: 1, checkedSteps: [], checkedIngredients: [],
    }
    get.mockResolvedValue(JSON.stringify(existing))
    create.mockResolvedValue({})
    recordCook.mockRejectedValue(new Error('cook-log service down'))
    const service = await makeService()

    await service.finishSession('session_1', 'user_1')

    expect(del).toHaveBeenCalledWith('cook-session:session_1')
    expect(del).toHaveBeenCalledWith('cook-session-active:user_1:recipe_a')
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
})
