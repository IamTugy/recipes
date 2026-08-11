import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { RecipeImportService } from '../import/recipe-import.service'
import { RecipesService } from '../recipes.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const importService = { resolveLinks: jest.fn() }
  const recipesService = { createDraft: jest.fn(), updateDraft: jest.fn(), findLinkCandidates: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeAiGenerateController(
    aiGenerateService as unknown as RecipeAiGenerateService,
    importService as unknown as RecipeImportService,
    recipesService as unknown as RecipesService,
    activityLog as any,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    recipesService.findLinkCandidates.mockResolvedValue([])
    importService.resolveLinks.mockResolvedValue([])
  })

  it('generates then persists each recipe as a pending-review draft sharing one batchId', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { title: 'Chocolate Cake', aiGenerated: true, sources: [] },
      { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
    ])
    recipesService.createDraft
      .mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })
      .mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

    const result = await controller.generate({ query: 'chocolate cake and vanilla frosting' }, { userId: 'user_1' } as any)

    expect(recipesService.createDraft).toHaveBeenCalledTimes(2)
    const [, , opts1] = recipesService.createDraft.mock.calls[0]
    const [, , opts2] = recipesService.createDraft.mock.calls[1]
    // both calls share the exact same batchId
    expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
    expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
    expect(recipesService.createDraft.mock.calls[0][0]).toBe('user_1')
    expect(opts1.pendingReview).toBe(true)
    expect(opts2.pendingReview).toBe(true)
    expect(result).toEqual([{ id: 'a', title: 'Chocolate Cake' }, { id: 'b', title: 'Vanilla Frosting' }])
  })

  it('throws BadRequestException when no query is provided', async () => {
    await expect(controller.generate({}, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when the query is blank', async () => {
    await expect(controller.generate({ query: '   ' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('logs an ai_recipe_generate_used event with the batch size after a successful generation', async () => {
    aiGenerateService.generate.mockResolvedValue([{ title: 'Soup', aiGenerated: true, sources: [] }])
    recipesService.createDraft.mockResolvedValue({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
    await controller.generate({ query: 'tomato soup' }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used', { count: 1 })
  })

  it('skips a malformed generated recipe (missing title) but still persists and returns the other valid one(s) in the batch', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { aiGenerated: true, sources: [] }, // no title -> fails validation
      { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
    ])
    recipesService.createDraft.mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

    const result = await controller.generate({ query: 'vanilla frosting' }, { userId: 'user_1' } as any)

    expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: 'b', title: 'Vanilla Frosting' }])
  })

  it('throws BadRequestException without persisting anything when every recipe in the batch fails validation', async () => {
    aiGenerateService.generate.mockResolvedValue([{ aiGenerated: true, sources: [] }])

    await expect(controller.generate({ query: 'anything' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
    expect(recipesService.createDraft).not.toHaveBeenCalled()
  })

  it('links a generated recipe to an existing app recipe when resolveLinks finds a confident match', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { title: 'Chocolate Cake', aiGenerated: true, sources: [], ingredients: [{ items: [{ name: 'vanilla frosting' }] }] },
    ])
    recipesService.findLinkCandidates.mockResolvedValue([{ id: 'existing-1', title: 'Vanilla Frosting' }])
    importService.resolveLinks.mockResolvedValue([
      { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' },
    ])
    recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })

    await controller.generate({ query: 'chocolate cake' }, { userId: 'user_1' } as any)

    expect(recipesService.createDraft.mock.calls[0][1].ingredients).toEqual([
      { items: [{ name: 'vanilla frosting', linkedRecipeId: 'existing-1' }] },
    ])
  })

  it('links two recipes generated in the same batch to each other after both are created', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { title: 'Chocolate Cake', aiGenerated: true, sources: [], ingredients: [{ items: [{ name: 'vanilla frosting' }] }] },
      { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
    ])
    importService.resolveLinks.mockResolvedValue([
      { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToRecipeIndex: 1 },
    ])
    recipesService.createDraft
      .mockResolvedValueOnce({ id: 'cake-id', toObject: () => ({ id: 'cake-id', title: 'Chocolate Cake' }) })
      .mockResolvedValueOnce({ id: 'frosting-id', toObject: () => ({ id: 'frosting-id', title: 'Vanilla Frosting' }) })
    recipesService.updateDraft.mockResolvedValue({ toObject: () => ({ id: 'cake-id', title: 'Chocolate Cake', linked: true }) })

    const result = await controller.generate({ query: 'chocolate cake and vanilla frosting' }, { userId: 'user_1' } as any)

    expect(recipesService.updateDraft).toHaveBeenCalledWith(
      'cake-id',
      'user_1',
      false,
      expect.objectContaining({ ingredients: [{ items: [{ name: 'vanilla frosting', linkedRecipeId: 'frosting-id' }] }] }),
    )
    expect(result).toEqual([
      { id: 'cake-id', title: 'Chocolate Cake', linked: true },
      { id: 'frosting-id', title: 'Vanilla Frosting' },
    ])
  })
})
