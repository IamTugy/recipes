import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeAiGenerateService', () => {
  const geminiService = { generateWithSearch: jest.fn(), generateStructured: jest.fn() }
  const service = new RecipeAiGenerateService(geminiService as unknown as GeminiService)

  beforeEach(() => jest.clearAllMocks())

  it('researches with search grounding, then structures the result, and tags it as AI-generated', async () => {
    geminiService.generateWithSearch.mockResolvedValue({
      text: 'Tomato soup: boil tomatoes...',
      sources: [{ title: 'Best Tomato Soup', url: 'https://example.com/soup' }],
    })
    geminiService.generateStructured.mockResolvedValue({ title: 'Tomato Soup' })

    const result = await service.generate('best tomato soup')

    expect(geminiService.generateWithSearch).toHaveBeenCalledWith(expect.stringContaining('best tomato soup'))
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Tomato soup: boil tomatoes...'))
    expect(result).toEqual({
      title: 'Tomato Soup',
      aiGenerated: true,
      sources: [{ title: 'Best Tomato Soup', url: 'https://example.com/soup' }],
    })
  })

  it('propagates a Gemini error from the research step', async () => {
    geminiService.generateWithSearch.mockRejectedValue(new Error('Gemini quota exceeded'))
    await expect(service.generate('pasta')).rejects.toThrow('Gemini quota exceeded')
  })
})
