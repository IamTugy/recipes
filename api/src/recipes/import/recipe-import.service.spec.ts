import { RecipeImportService } from './recipe-import.service'
import * as sourceExtractor from './source-extractor'
import { GeminiService } from '../../ai/gemini.service'

jest.mock('./source-extractor')

describe('RecipeImportService', () => {
  const geminiService = { generateStructured: jest.fn(), generateStructuredWithImage: jest.fn(), generateWithSearch: jest.fn() }
  const service = new RecipeImportService(geminiService as unknown as GeminiService)

  beforeEach(() => jest.clearAllMocks())

  it('importFromText sends the text straight to Gemini', async () => {
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Soup' }] })
    const result = await service.importFromText('2 tomatoes, boil them')
    expect(result).toEqual([{ title: 'Soup' }])
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('2 tomatoes, boil them'))
  })

  it('importFromText returns every recipe when the source describes several', async () => {
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Soup' }, { title: 'Salad' }] })
    const result = await service.importFromText('a cooking class handout with two recipes')
    expect(result).toEqual([{ title: 'Soup' }, { title: 'Salad' }])
  })

  it('importFromText throws when Gemini finds no recipe', async () => {
    geminiService.generateStructured.mockResolvedValue({ recipes: [] })
    await expect(service.importFromText('not a recipe at all')).rejects.toThrow('Could not find a recipe')
  })

  it('importFromUrl skips Gemini entirely when JSON-LD structured data is found', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: '', structured: { name: 'Tomato Soup', recipeIngredient: ['2 tomatoes'] } })
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Tomato Soup' }] })
    const result = await service.importFromUrl('https://example.com/soup')
    expect(result[0].title).toBe('Tomato Soup')
  })

  it('importFromUrl falls back to Gemini when no JSON-LD is found', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: 'Tomato Soup recipe text' })
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Tomato Soup' }] })
    const result = await service.importFromUrl('https://example.com/soup')
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Tomato Soup recipe text'))
    expect(result).toEqual([{ title: 'Tomato Soup' }])
  })

  it('importFromUrl routes social media links to importFromSocialUrl instead of extractFromUrl', async () => {
    ;(sourceExtractor.isSocialMediaUrl as jest.Mock).mockReturnValue(true)
    ;(sourceExtractor.extractTikTokOembed as jest.Mock).mockResolvedValue('A great soup. By chef')
    geminiService.generateWithSearch.mockResolvedValue({ text: 'Full recipe: 2 tomatoes, boil them', sources: [] })
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Tomato Soup' }] })

    const result = await service.importFromUrl('https://www.tiktok.com/@chef/video/123', 'Best soup ever')

    expect(sourceExtractor.extractFromUrl).not.toHaveBeenCalled()
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Best soup ever'))
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('A great soup. By chef'))
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Full recipe: 2 tomatoes, boil them'))
    expect(result).toEqual([{ title: 'Tomato Soup' }])
  })

  it('importFromSocialUrl throws when no caption, oEmbed, or search result is found', async () => {
    ;(sourceExtractor.extractTikTokOembed as jest.Mock).mockResolvedValue(null)
    geminiService.generateWithSearch.mockResolvedValue({ text: '', sources: [] })
    await expect(service.importFromSocialUrl('https://www.instagram.com/reel/abc')).rejects.toThrow('Could not find recipe content')
  })

  it('importFromUrl includes the caption text with regular JSON-LD-less pages', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: 'Tomato Soup recipe text' })
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Tomato Soup' }] })
    await service.importFromUrl('https://example.com/soup', 'make it vegan')
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('make it vegan'))
  })

  it('importFromFile dispatches to PDF extraction for application/pdf', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('pdf recipe text')
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'From PDF' }] })
    const result = await service.importFromFile(Buffer.from('x'), 'application/pdf')
    expect(sourceExtractor.extractFromPdf).toHaveBeenCalled()
    expect(result).toEqual([{ title: 'From PDF' }])
  })

  it('importFromFile returns every recipe found in a multi-recipe document', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('a cooking class handout with several recipes')
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'Salad' }, { title: 'Spring rolls' }, { title: 'Pho' }] })
    const result = await service.importFromFile(Buffer.from('x'), 'application/pdf')
    expect(result).toHaveLength(3)
  })

  it('importFromFile dispatches to DOCX extraction for the docx mime type', async () => {
    ;(sourceExtractor.extractFromDocx as jest.Mock).mockResolvedValue('docx recipe text')
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'From DOCX' }] })
    const result = await service.importFromFile(Buffer.from('x'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(sourceExtractor.extractFromDocx).toHaveBeenCalled()
    expect(result).toEqual([{ title: 'From DOCX' }])
  })

  it('importFromFile throws for an unsupported mime type', async () => {
    await expect(service.importFromFile(Buffer.from('x'), 'application/msword')).rejects.toThrow('Unsupported file type')
  })

  it('importFromFile combines the prompt text with the extracted file text', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('pdf recipe text')
    geminiService.generateStructured.mockResolvedValue({ recipes: [{ title: 'From PDF' }] })
    await service.importFromFile(Buffer.from('x'), 'application/pdf', 'make it vegan')
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('make it vegan'))
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('pdf recipe text'))
  })

  it('importFromFile throws a clear error when the file has no extractable text', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('   ')
    await expect(service.importFromFile(Buffer.from('x'), 'application/pdf')).rejects.toThrow('Could not find any text')
  })

  it('importFromImage sends the photo straight to Gemini vision', async () => {
    geminiService.generateStructuredWithImage.mockResolvedValue({ recipes: [{ title: 'From photo' }] })
    const buffer = Buffer.from('fake-jpeg-bytes')
    const result = await service.importFromImage(buffer, 'image/jpeg')
    expect(result).toEqual([{ title: 'From photo' }])
    expect(geminiService.generateStructuredWithImage).toHaveBeenCalledWith(
      expect.any(String),
      buffer.toString('base64'),
      'image/jpeg',
    )
  })

  it('importFromImage includes the prompt text when provided', async () => {
    geminiService.generateStructuredWithImage.mockResolvedValue({ recipes: [{ title: 'From photo' }] })
    await service.importFromImage(Buffer.from('x'), 'image/jpeg', 'make it vegan')
    expect(geminiService.generateStructuredWithImage).toHaveBeenCalledWith(
      expect.stringContaining('make it vegan'),
      expect.any(String),
      'image/jpeg',
    )
  })

  it('importFromImage throws when Gemini finds no recipe', async () => {
    geminiService.generateStructuredWithImage.mockResolvedValue({ recipes: [] })
    await expect(service.importFromImage(Buffer.from('x'), 'image/jpeg')).rejects.toThrow('Could not find a recipe')
  })

  it('propagates a Gemini error', async () => {
    geminiService.generateStructured.mockRejectedValue(new Error('Gemini quota exceeded'))
    await expect(service.importFromText('some text')).rejects.toThrow('Gemini quota exceeded')
  })

  it('resolveLinks asks Gemini for matches and returns them', async () => {
    geminiService.generateStructured.mockResolvedValue({
      links: [{ recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' }],
    })
    const recipes = [{ title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce' }] }] }]
    const candidates = [{ id: 'existing-1', title: 'Peanut Dipping Sauce' }]

    const result = await service.resolveLinks(recipes, candidates)

    expect(result).toEqual([{ recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' }])
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('dipping sauce'))
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Peanut Dipping Sauce'))
  })

  it('resolveLinks skips the Gemini call entirely for a single recipe with no existing candidates', async () => {
    const result = await service.resolveLinks([{ title: 'Spring Rolls' }], [])
    expect(result).toEqual([])
    expect(geminiService.generateStructured).not.toHaveBeenCalled()
  })

  it('resolveLinks returns an empty array when Gemini finds no matches', async () => {
    geminiService.generateStructured.mockResolvedValue({ links: [] })
    const result = await service.resolveLinks([{ title: 'A' }, { title: 'B' }], [])
    expect(result).toEqual([])
  })
})
