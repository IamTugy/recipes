import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookHistoryService } from './cook-history.service'
import { CookSession } from '../cook-sessions/schemas/cook-session.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'

describe('CookHistoryService', () => {
  const cookSessionFind = jest.fn()
  const cookSessionModel = { find: cookSessionFind }
  const recipeFind = jest.fn()
  const recipeFindOne = jest.fn()
  const recipeModel = { find: recipeFind, findOne: recipeFindOne }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookHistoryService,
        { provide: getModelToken(CookSession.name), useValue: cookSessionModel },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
      ],
    }).compile()
    return moduleRef.get(CookHistoryService)
  }

  function chainable(result: unknown) {
    const exec = jest.fn().mockResolvedValue(result)
    const lean = jest.fn().mockReturnValue({ exec })
    const limit = jest.fn().mockReturnValue({ lean })
    const sort = jest.fn().mockReturnValue({ limit, lean })
    const select = jest.fn().mockReturnValue({ sort, lean, exec })
    const chain = { select, sort, limit, lean, exec }
    // Expose intermediate mocks for test assertions
    ;(chain as any)._sortMock = sort
    ;(chain as any)._limitMock = limit
    return chain
  }

  describe('getStats', () => {
    it('computes totalRecipesCooked as the count of distinct recipeIds', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000002', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: '000000000000000000000001', title: 'A' }, { _id: '000000000000000000000002', title: 'B' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalRecipesCooked).toBe(2)
    })

    it('computes totalCooks as the total session count', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: '000000000000000000000001', title: 'A' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalCooks).toBe(2)
    })

    it('sums totalDurationSeconds across all sessions', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 100 },
        { recipeId: '000000000000000000000002', finishedAt: new Date(), totalDurationSeconds: 250 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: '000000000000000000000001', title: 'A' }, { _id: '000000000000000000000002', title: 'B' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalTimeSpentSeconds).toBe(350)
    })

    it('returns 12 zero-filled months when there are no sessions', async () => {
      cookSessionFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.cooksByMonth).toHaveLength(12)
      expect(stats.cooksByMonth.every(m => m.count === 0)).toBe(true)
    })

    it('buckets a session into its finished month', async () => {
      const now = new Date()
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: now, totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: '000000000000000000000001', title: 'A' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const bucket = stats.cooksByMonth.find(m => m.month === thisMonthKey)
      expect(bucket?.count).toBe(1)
    })

    it('returns the top 5 most-cooked recipes by session count, with titles resolved', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000002', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: '000000000000000000000001', title: 'Chicken Soup' }, { _id: '000000000000000000000002', title: 'Toast' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.mostCooked[0]).toEqual({ recipeId: '000000000000000000000001', recipeTitle: 'Chicken Soup', count: 3 })
    })

    it('omits a most-cooked entry when its recipe title cannot be resolved', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.mostCooked).toEqual([])
    })

    it('handles sessions with a malformed recipeId without throwing', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'not-a-valid-object-id', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      expect(stats.totalCooks).toBe(1)
      expect(stats.totalRecipesCooked).toBe(1)
      expect(stats.mostCooked).toEqual([])
      expect(recipeFind).not.toHaveBeenCalled()
    })

    it('excludes a session finished more than 12 months ago from cooksByMonth', async () => {
      const now = new Date()
      const tooOld = new Date(now.getFullYear(), now.getMonth() - 13, 15)
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'a', finishedAt: tooOld, totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([{ _id: 'a', title: 'A' }]))
      const service = await makeService()
      const stats = await service.getStats('user_1')
      const totalBucketed = stats.cooksByMonth.reduce((sum, m) => sum + m.count, 0)
      expect(totalBucketed).toBe(0)
    })
  })

  describe('getHistory', () => {
    it('returns entries sorted most-recent-first with resolved titles', async () => {
      const older = new Date('2026-01-01')
      const newer = new Date('2026-02-01')
      const chainValue = chainable([
        { recipeId: '000000000000000000000001', finishedAt: newer, totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000002', finishedAt: older, totalDurationSeconds: 90 },
      ])
      cookSessionFind.mockReturnValue(chainValue)
      recipeFind.mockReturnValue(chainable([{ _id: '000000000000000000000001', title: 'A' }, { _id: '000000000000000000000002', title: 'B' }]))
      const service = await makeService()
      const result = await service.getHistory('user_1')
      expect(result).toEqual([
        { recipeId: '000000000000000000000001', recipeTitle: 'A', finishedAt: newer.toISOString(), totalDurationSeconds: 60 },
        { recipeId: '000000000000000000000002', recipeTitle: 'B', finishedAt: older.toISOString(), totalDurationSeconds: 90 },
      ])
      expect(cookSessionFind).toHaveBeenCalledWith({ userId: 'user_1' })
      expect((chainValue as any)._sortMock).toHaveBeenCalledWith({ finishedAt: -1 })
      expect((chainValue as any)._limitMock).toHaveBeenCalledWith(100)
    })

    it('omits an entry whose recipe title cannot be resolved', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: '000000000000000000000001', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      recipeFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const result = await service.getHistory('user_1')
      expect(result).toEqual([])
    })

    it('returns an empty array without querying recipes when there are no sessions', async () => {
      cookSessionFind.mockReturnValue(chainable([]))
      const service = await makeService()
      const result = await service.getHistory('user_1')
      expect(result).toEqual([])
      expect(recipeFind).not.toHaveBeenCalled()
    })

    it('omits entries with malformed recipeIds instead of throwing', async () => {
      cookSessionFind.mockReturnValue(chainable([
        { recipeId: 'not-a-valid-object-id', finishedAt: new Date(), totalDurationSeconds: 60 },
      ]))
      const service = await makeService()
      await expect(service.getHistory('user_1')).resolves.toEqual([])
      expect(recipeFind).not.toHaveBeenCalled()
    })
  })

  describe('getRecipeHistory', () => {
    it('returns the recipe title and its sessions, most-recent-first', async () => {
      recipeFindOne.mockReturnValue(chainable({ title: 'Chicken Soup' }))
      const older = new Date('2026-01-01')
      const newer = new Date('2026-02-01')
      cookSessionFind.mockReturnValue(chainable([
        { finishedAt: newer, totalDurationSeconds: 120, steps: [{ stepNum: 1, durationSeconds: 60 }] },
        { finishedAt: older, totalDurationSeconds: 90, steps: [] },
      ]))
      const service = await makeService()
      const result = await service.getRecipeHistory('user_1', '000000000000000000000001')
      expect(result).toEqual({
        recipeTitle: 'Chicken Soup',
        sessions: [
          { finishedAt: newer.toISOString(), totalDurationSeconds: 120, steps: [{ stepNum: 1, durationSeconds: 60 }] },
          { finishedAt: older.toISOString(), totalDurationSeconds: 90, steps: [] },
        ],
      })
      expect(cookSessionFind).toHaveBeenCalledWith({ userId: 'user_1', recipeId: '000000000000000000000001' })
    })

    it('returns null when the recipe cannot be found', async () => {
      recipeFindOne.mockReturnValue(chainable(null))
      const service = await makeService()
      const result = await service.getRecipeHistory('user_1', '000000000000000000000001')
      expect(result).toBeNull()
    })

    it('returns null instead of throwing when the recipe id is malformed', async () => {
      recipeFindOne.mockReturnValue({ select: () => ({ lean: () => ({ exec: jest.fn().mockRejectedValue(new Error('cast error')) }) }) })
      const service = await makeService()
      const result = await service.getRecipeHistory('user_1', 'not-a-valid-id')
      expect(result).toBeNull()
    })
  })
})
