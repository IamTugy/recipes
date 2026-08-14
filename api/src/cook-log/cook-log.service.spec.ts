import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookLogService } from './cook-log.service'
import { CookLog } from './schemas/cook-log.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'

describe('CookLogService', () => {
  const findOne = jest.fn()
  const create = jest.fn()
  const find = jest.fn()
  const aggregate = jest.fn()
  const syncIndexes = jest.fn()
  const cookLogModel = { findOne, create, find, aggregate, syncIndexes }

  const recipeFindOne = jest.fn()
  const recipeModel = { findOne: recipeFindOne }

  const activityLogRecord = jest.fn()
  const activityLogService = { record: activityLogRecord }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookLogService,
        { provide: getModelToken(CookLog.name), useValue: cookLogModel },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: ActivityLogService, useValue: activityLogService },
      ],
    }).compile()
    return moduleRef.get(CookLogService)
  }

  it('onModuleInit syncs indexes on startup', async () => {
    syncIndexes.mockResolvedValue(undefined)
    const service = await makeService()
    await service.onModuleInit()
    expect(syncIndexes).toHaveBeenCalled()
  })

  it('onModuleInit does not throw when syncIndexes fails', async () => {
    syncIndexes.mockRejectedValue(new Error('permission denied'))
    const service = await makeService()
    await expect(service.onModuleInit()).resolves.toBeUndefined()
  })

  it('recordCook treats a pre-migration row with no cookedAt as no effective cooldown, inserting normally', async () => {
    findOne.mockReturnValue({ sort: () => ({ exec: jest.fn().mockResolvedValue({ userId: 'user_1', recipeId: 'recipe_a' }) }) })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
    create.mockResolvedValue({})
    const service = await makeService()
    await expect(service.recordCook('user_1', 'recipe_a')).resolves.toBeUndefined()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', recipeId: 'recipe_a' }))
  })

  it('recordCook inserts a new row on the very first cook of a recipe', async () => {
    findOne.mockReturnValue({ sort: () => ({ exec: jest.fn().mockResolvedValue(null) }) })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
    create.mockResolvedValue({})
    const service = await makeService()
    await service.recordCook('user_1', 'recipe_a')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', recipeId: 'recipe_a' }))
    expect(activityLogRecord).toHaveBeenCalledWith('user_1', 'recipe_a', 'recipe_cooked')
  })

  it('recordCook silently no-ops when the last cook was inside the cooldown window', async () => {
    const now = new Date('2026-08-14T10:30:00.000Z')
    const realDateNow = Date.now
    Date.now = () => now.getTime()
    try {
      findOne.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue({ cookedAt: new Date('2026-08-14T10:20:00.000Z') }) }),
      })
      recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
      const service = await makeService()
      await service.recordCook('user_1', 'recipe_a')
      expect(create).not.toHaveBeenCalled()
      expect(activityLogRecord).not.toHaveBeenCalled()
    } finally {
      Date.now = realDateNow
    }
  })

  it('recordCook inserts a new row when the last cook was outside the cooldown window', async () => {
    const now = new Date('2026-08-14T11:00:00.000Z')
    const realDateNow = Date.now
    Date.now = () => now.getTime()
    try {
      findOne.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue({ cookedAt: new Date('2026-08-14T10:20:00.000Z') }) }),
      })
      recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
      create.mockResolvedValue({})
      const service = await makeService()
      await service.recordCook('user_1', 'recipe_a')
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', recipeId: 'recipe_a' }))
    } finally {
      Date.now = realDateNow
    }
  })

  it('recordCook applies the 10-minute cooldown floor when the recipe has no prepTime/cookTime set', async () => {
    const now = new Date('2026-08-14T10:05:00.000Z')
    const realDateNow = Date.now
    Date.now = () => now.getTime()
    try {
      findOne.mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue({ cookedAt: new Date('2026-08-14T10:00:00.000Z') }) }),
      })
      recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
      const service = await makeService()
      await service.recordCook('user_1', 'recipe_a')
      expect(create).not.toHaveBeenCalled()
    } finally {
      Date.now = realDateNow
    }
  })

  it('recordCook does not throw when the Mongo write fails', async () => {
    findOne.mockReturnValue({ sort: () => ({ exec: jest.fn().mockResolvedValue(null) }) })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ prepTime: 10, cookTime: 20 }) })
    create.mockRejectedValue(new Error('mongo down'))
    const service = await makeService()
    await expect(service.recordCook('user_1', 'recipe_a')).resolves.toBeUndefined()
  })

  it('countsById returns a count per recipe, aggregated across all users', async () => {
    aggregate.mockResolvedValue([{ _id: 'a', count: 3 }])
    const service = await makeService()
    const result = await service.countsById(['a', 'b'])
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { recipeId: { $in: ['a', 'b'] } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])
    expect(result).toEqual(new Map([['a', 3]]))
  })

  it('userCountsById returns a count per recipe, scoped to one user', async () => {
    aggregate.mockResolvedValue([{ _id: 'a', count: 2 }])
    const service = await makeService()
    const result = await service.userCountsById('user_1', ['a', 'b'])
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { userId: 'user_1', recipeId: { $in: ['a', 'b'] } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])
    expect(result).toEqual(new Map([['a', 2]]))
  })
})
