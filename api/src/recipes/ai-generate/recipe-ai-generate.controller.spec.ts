import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { RecipesService } from '../recipes.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const recipesService = { createDraft: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeAiGenerateController(
    aiGenerateService as unknown as RecipeAiGenerateService,
    recipesService as unknown as RecipesService,
    activityLog as any,
  )

  beforeEach(() => jest.clearAllMocks())

  it('generates then persists each recipe as a pending-review draft sharing one batchId', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { title: 'Chocolate Cake', aiGenerated: true, sources: [] },
      { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
    ])
    recipesService.createDraft
      .mockResolvedValueOnce({ toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })
      .mockResolvedValueOnce({ toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

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
    recipesService.createDraft.mockResolvedValue({ toObject: () => ({ id: 'a', title: 'Soup' }) })
    await controller.generate({ query: 'tomato soup' }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used', { count: 1 })
  })

  it('skips a malformed generated recipe (missing title) but still persists and returns the other valid one(s) in the batch', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { aiGenerated: true, sources: [] }, // no title -> fails validation
      { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
    ])
    recipesService.createDraft.mockResolvedValueOnce({ toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

    const result = await controller.generate({ query: 'vanilla frosting' }, { userId: 'user_1' } as any)

    expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: 'b', title: 'Vanilla Frosting' }])
  })

  it('throws BadRequestException without persisting anything when every recipe in the batch fails validation', async () => {
    aiGenerateService.generate.mockResolvedValue([{ aiGenerated: true, sources: [] }])

    await expect(controller.generate({ query: 'anything' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
    expect(recipesService.createDraft).not.toHaveBeenCalled()
  })
})
