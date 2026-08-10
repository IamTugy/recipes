import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeAiGenerateService', () => {
  const geminiService = { generateWithSearch: jest.fn(), generateStructured: jest.fn() }
  const service = new RecipeAiGenerateService(geminiService as unknown as GeminiService)

  beforeEach(() => jest.clearAllMocks())

  it('splits a request into one recipe when it names one recipe, then researches and structures it', async () => {
    geminiService.generateStructured
      .mockResolvedValueOnce({ recipes: ['best tomato soup'] })
      .mockResolvedValueOnce({ title: 'Tomato Soup' })
    geminiService.generateWithSearch.mockResolvedValue({
      text: 'Tomato soup: boil tomatoes...',
      sources: [{ title: 'Best Tomato Soup', url: 'https://example.com/soup' }],
    })

    const result = await service.generate('best tomato soup')

    expect(geminiService.generateStructured).toHaveBeenNthCalledWith(1, expect.stringContaining('best tomato soup'))
    expect(geminiService.generateWithSearch).toHaveBeenCalledWith(expect.stringContaining('best tomato soup'))
    expect(geminiService.generateStructured).toHaveBeenNthCalledWith(2, expect.stringContaining('Tomato soup: boil tomatoes...'))
    expect(result).toEqual([{
      title: 'Tomato Soup',
      aiGenerated: true,
      sources: [{ title: 'Best Tomato Soup', url: 'https://example.com/soup' }],
    }])
  })

  it('splits a request naming several recipes into one generated recipe per item', async () => {
    geminiService.generateStructured
      .mockResolvedValueOnce({ recipes: ['chocolate cake', 'vanilla frosting'] })
      .mockResolvedValueOnce({ title: 'Chocolate Cake' })
      .mockResolvedValueOnce({ title: 'Vanilla Frosting' })
    geminiService.generateWithSearch
      .mockResolvedValueOnce({ text: 'Chocolate cake write-up', sources: [] })
      .mockResolvedValueOnce({ text: 'Vanilla frosting write-up', sources: [] })

    const result = await service.generate('chocolate cake and vanilla frosting')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ title: 'Chocolate Cake', aiGenerated: true, sources: [] })
    expect(result[1]).toEqual({ title: 'Vanilla Frosting', aiGenerated: true, sources: [] })
  })

  it('falls back to the original query as a single recipe if the split step returns no items', async () => {
    geminiService.generateStructured
      .mockResolvedValueOnce({ recipes: [] })
      .mockResolvedValueOnce({ title: 'Tomato Soup' })
    geminiService.generateWithSearch.mockResolvedValue({ text: 'write-up', sources: [] })

    const result = await service.generate('best tomato soup')

    expect(result).toEqual([{ title: 'Tomato Soup', aiGenerated: true, sources: [] }])
  })

  it('propagates a Gemini error from the research step', async () => {
    geminiService.generateStructured.mockResolvedValueOnce({ recipes: ['pasta'] })
    geminiService.generateWithSearch.mockRejectedValue(new Error('Gemini quota exceeded'))
    await expect(service.generate('pasta')).rejects.toThrow('Gemini quota exceeded')
  })
})
