import { NotFoundException } from '@nestjs/common'
import { CookHistoryController } from './cook-history.controller'

describe('CookHistoryController', () => {
  const cookHistoryService = {
    getStats: jest.fn(),
    getHistory: jest.fn(),
    getRecipeHistory: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('GET /cook-history/stats returns stats for the authenticated user', async () => {
    const stats = { totalRecipesCooked: 2, totalCooks: 3, totalTimeSpentSeconds: 300, cooksByMonth: [], mostCooked: [] }
    cookHistoryService.getStats.mockResolvedValue(stats)
    const controller = new CookHistoryController(cookHistoryService as any)
    const result = await controller.getStats({ userId: 'user_1' } as any)
    expect(cookHistoryService.getStats).toHaveBeenCalledWith('user_1')
    expect(result).toEqual(stats)
  })

  it('GET /cook-history returns the history list for the authenticated user', async () => {
    const entries = [{ recipeId: 'a', recipeTitle: 'A', finishedAt: '2026-01-01T00:00:00.000Z', totalDurationSeconds: 60 }]
    cookHistoryService.getHistory.mockResolvedValue(entries)
    const controller = new CookHistoryController(cookHistoryService as any)
    const result = await controller.getHistory({ userId: 'user_1' } as any)
    expect(cookHistoryService.getHistory).toHaveBeenCalledWith('user_1')
    expect(result).toEqual(entries)
  })

  it('GET /cook-history/:recipeId returns the per-recipe history', async () => {
    const view = { recipeTitle: 'A', sessions: [] }
    cookHistoryService.getRecipeHistory.mockResolvedValue(view)
    const controller = new CookHistoryController(cookHistoryService as any)
    const result = await controller.getRecipeHistory('recipe_a', { userId: 'user_1' } as any)
    expect(cookHistoryService.getRecipeHistory).toHaveBeenCalledWith('user_1', 'recipe_a')
    expect(result).toEqual(view)
  })

  it('GET /cook-history/:recipeId throws NotFoundException when the recipe cannot be resolved', async () => {
    cookHistoryService.getRecipeHistory.mockResolvedValue(null)
    const controller = new CookHistoryController(cookHistoryService as any)
    await expect(controller.getRecipeHistory('recipe_missing', { userId: 'user_1' } as any))
      .rejects.toThrow(NotFoundException)
  })
})
