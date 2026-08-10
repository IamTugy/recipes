import { RecipeImportService } from './recipe-import.service'
import * as sourceExtractor from './source-extractor'
import { GeminiService } from '../../ai/gemini.service'

jest.mock('./source-extractor')

describe('RecipeImportService', () => {
  const geminiService = { generateStructured: jest.fn() }
  const service = new RecipeImportService(geminiService as unknown as GeminiService)

  beforeEach(() => jest.clearAllMocks())

  it('importFromText sends the text straight to Gemini', async () => {
    geminiService.generateStructured.mockResolvedValue({ title: 'Soup' })
    const result = await service.importFromText('2 tomatoes, boil them')
    expect(result).toEqual({ title: 'Soup' })
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('2 tomatoes, boil them'))
  })

  it('importFromUrl skips Gemini entirely when JSON-LD structured data is found', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: '', structured: { name: 'Tomato Soup', recipeIngredient: ['2 tomatoes'] } })
    geminiService.generateStructured.mockResolvedValue({ title: 'Tomato Soup' })
    const result = await service.importFromUrl('https://example.com/soup')
    expect(result.title).toBe('Tomato Soup')
  })

  it('importFromUrl falls back to Gemini when no JSON-LD is found', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: 'Tomato Soup recipe text' })
    geminiService.generateStructured.mockResolvedValue({ title: 'Tomato Soup' })
    const result = await service.importFromUrl('https://example.com/soup')
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Tomato Soup recipe text'))
    expect(result).toEqual({ title: 'Tomato Soup' })
  })

  it('importFromFile dispatches to PDF extraction for application/pdf', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('pdf recipe text')
    geminiService.generateStructured.mockResolvedValue({ title: 'From PDF' })
    const result = await service.importFromFile(Buffer.from('x'), 'application/pdf')
    expect(sourceExtractor.extractFromPdf).toHaveBeenCalled()
    expect(result).toEqual({ title: 'From PDF' })
  })

  it('importFromFile dispatches to DOCX extraction for the docx mime type', async () => {
    ;(sourceExtractor.extractFromDocx as jest.Mock).mockResolvedValue('docx recipe text')
    geminiService.generateStructured.mockResolvedValue({ title: 'From DOCX' })
    const result = await service.importFromFile(Buffer.from('x'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(sourceExtractor.extractFromDocx).toHaveBeenCalled()
    expect(result).toEqual({ title: 'From DOCX' })
  })

  it('importFromFile throws for an unsupported mime type', async () => {
    await expect(service.importFromFile(Buffer.from('x'), 'application/msword')).rejects.toThrow('Unsupported file type')
  })

  it('importFromFile combines the prompt text with the extracted file text', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('pdf recipe text')
    geminiService.generateStructured.mockResolvedValue({ title: 'From PDF' })
    await service.importFromFile(Buffer.from('x'), 'application/pdf', 'make it vegan')
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('make it vegan'))
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('pdf recipe text'))
  })

  it('importFromFile throws a clear error when the file has no extractable text', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('   ')
    await expect(service.importFromFile(Buffer.from('x'), 'application/pdf')).rejects.toThrow('Could not find any text')
  })

  it('propagates a Gemini error', async () => {
    geminiService.generateStructured.mockRejectedValue(new Error('Gemini quota exceeded'))
    await expect(service.importFromText('some text')).rejects.toThrow('Gemini quota exceeded')
  })
})
