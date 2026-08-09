import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeAiGenerateController(aiGenerateService as unknown as RecipeAiGenerateService, activityLog as any)

  beforeEach(() => jest.clearAllMocks())

  it('generates a recipe from a query', async () => {
    aiGenerateService.generate.mockResolvedValue({ title: 'Soup', aiGenerated: true, sources: [] })
    const result = await controller.generate({ query: '  best tomato soup  ' }, { userId: 'user_1' } as any)
    expect(aiGenerateService.generate).toHaveBeenCalledWith('best tomato soup')
    expect(result).toEqual({ title: 'Soup', aiGenerated: true, sources: [] })
  })

  it('throws BadRequestException when no query is provided', async () => {
    await expect(controller.generate({}, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when the query is blank', async () => {
    await expect(controller.generate({ query: '   ' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('logs an ai_recipe_generate_used event after a successful generation', async () => {
    aiGenerateService.generate.mockResolvedValue({ title: 'Soup' })
    await controller.generate({ query: 'tomato soup' }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used')
  })
})
