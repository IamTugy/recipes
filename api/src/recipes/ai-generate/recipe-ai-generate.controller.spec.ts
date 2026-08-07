import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const controller = new RecipeAiGenerateController(aiGenerateService as unknown as RecipeAiGenerateService)

  beforeEach(() => jest.clearAllMocks())

  it('generates a recipe from a query', async () => {
    aiGenerateService.generate.mockResolvedValue({ title: 'Soup', aiGenerated: true, sources: [] })
    const result = await controller.generate({ query: '  best tomato soup  ' })
    expect(aiGenerateService.generate).toHaveBeenCalledWith('best tomato soup')
    expect(result).toEqual({ title: 'Soup', aiGenerated: true, sources: [] })
  })

  it('throws BadRequestException when no query is provided', async () => {
    await expect(controller.generate({})).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when the query is blank', async () => {
    await expect(controller.generate({ query: '   ' })).rejects.toThrow(BadRequestException)
  })
})
