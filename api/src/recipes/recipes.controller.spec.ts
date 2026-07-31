import { NotFoundException } from '@nestjs/common'
import { RecipesController } from './recipes.controller'

describe('RecipesController', () => {
  const recipesService = { findAll: jest.fn(), findBySlug: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('GET /recipes returns all recipes', async () => {
    recipesService.findAll.mockResolvedValue([{ slug: 'a' }])
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    await expect(controller.findAll()).resolves.toEqual([{ slug: 'a' }])
  })

  it('GET /recipes/:slug returns the recipe and logs a view', async () => {
    recipesService.findBySlug.mockResolvedValue({ slug: 'a' })
    const activityLog = { record: jest.fn() }
    const controller = new RecipesController(recipesService as any, activityLog as any)

    const result = await controller.findOne('a', { userId: 'user_1' } as any)

    expect(result).toEqual({ slug: 'a' })
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_viewed')
  })

  it('GET /recipes/:slug throws 404 when not found', async () => {
    recipesService.findBySlug.mockResolvedValue(null)
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    await expect(controller.findOne('missing', { userId: 'user_1' } as any)).rejects.toThrow(NotFoundException)
  })
})
