import { NotFoundException } from '@nestjs/common'
import { RecipesController } from './recipes.controller'

describe('RecipesController', () => {
  const recipesService = { findAll: jest.fn(), findBySlug: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() }

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

  it('GET /recipes/trending returns recipes for the trending slugs, skipping any since-deleted ones', async () => {
    const activityLog = { record: jest.fn(), trendingSlugs: jest.fn().mockResolvedValue(['a', 'gone', 'b']) }
    recipesService.findBySlug.mockImplementation((slug: string) =>
      slug === 'gone' ? Promise.resolve(null) : Promise.resolve({ slug })
    )
    const controller = new RecipesController(recipesService as any, activityLog as any)

    const result = await controller.trending()

    expect(activityLog.trendingSlugs).toHaveBeenCalled()
    expect(result).toEqual([{ slug: 'a' }, { slug: 'b' }])
  })

  it('POST /recipes creates a recipe', async () => {
    const created = { toObject: () => ({ slug: 'tomato-soup', title: 'Tomato Soup' }) }
    recipesService.create.mockResolvedValue(created)
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    const body = { title: 'Tomato Soup' } as any
    const result = await controller.create(body)
    expect(recipesService.create).toHaveBeenCalledWith(body)
    expect(result).toEqual({ slug: 'tomato-soup', title: 'Tomato Soup' })
  })

  it('PUT /recipes/:slug updates a recipe', async () => {
    const updated = { toObject: () => ({ slug: 'tomato-soup', title: 'Tomato Soup v2' }) }
    recipesService.update.mockResolvedValue(updated)
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    const body = { title: 'Tomato Soup v2' } as any
    const result = await controller.update('tomato-soup', body)
    expect(recipesService.update).toHaveBeenCalledWith('tomato-soup', body)
    expect(result).toEqual({ slug: 'tomato-soup', title: 'Tomato Soup v2' })
  })

  it('PUT /recipes/:slug throws 404 when the recipe does not exist', async () => {
    recipesService.update.mockResolvedValue(null)
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    await expect(controller.update('missing', {} as any)).rejects.toThrow(NotFoundException)
  })

  it('DELETE /recipes/:slug deletes a recipe', async () => {
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    const result = await controller.remove('tomato-soup')
    expect(recipesService.remove).toHaveBeenCalledWith('tomato-soup')
    expect(result).toEqual({ deleted: true })
  })
})
