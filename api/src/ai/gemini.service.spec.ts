import { ConfigService } from '@nestjs/config'
import { GeminiService } from './gemini.service'

const mockGenerateContent = jest.fn()

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  Modality: { IMAGE: 'IMAGE' },
}))

describe('GeminiService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('generateStructured parses the JSON text response', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"title":"Soup"}' })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    const result = await service.generateStructured<{ title: string }>('extract this')
    expect(result).toEqual({ title: 'Soup' })
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash',
      contents: 'extract this',
      config: { responseMimeType: 'application/json' },
    })
  })

  it('generateStructured throws when GEMINI_API_KEY is not configured', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateStructured('x')).rejects.toThrow('GEMINI_API_KEY is not configured')
  })

  it('generateStructured throws when Gemini returns an empty response', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateStructured('x')).rejects.toThrow('Gemini returned an empty response')
  })

  it('generateText returns the plain text response', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'hello there' })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateText('say hi')).resolves.toBe('hello there')
    expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-3.5-flash', contents: 'say hi' })
  })

  it('generateWithSearch uses the googleSearch tool and returns deduped cited sources', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Here is the best recipe...',
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.com/a', title: 'Recipe A' } },
            { web: { uri: 'https://example.com/a', title: 'Recipe A' } },
            { web: { uri: 'https://example.com/b' } },
            {},
          ],
        },
      }],
    })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    const result = await service.generateWithSearch('find the best soup')

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash',
      contents: 'find the best soup',
      config: { tools: [{ googleSearch: {} }] },
    })
    expect(result).toEqual({
      text: 'Here is the best recipe...',
      sources: [
        { title: 'Recipe A', url: 'https://example.com/a' },
        { title: 'https://example.com/b', url: 'https://example.com/b' },
      ],
    })
  })

  it('generateWithSearch returns no sources when grounding metadata is absent', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'plain answer' })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateWithSearch('x')).resolves.toEqual({ text: 'plain answer', sources: [] })
  })

  it('generateWithSearch throws when Gemini returns an empty response', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateWithSearch('x')).rejects.toThrow('Gemini returned an empty response')
  })

  it('editImage returns the inline image data from the response', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { data: 'YmFzZTY0', mimeType: 'image/png' } }] } }],
    })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    const result = await service.editImage('aW5wdXQ=', 'image/jpeg', 'retouch it')

    expect(result).toEqual({ data: 'YmFzZTY0', mimeType: 'image/png' })
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [{ inlineData: { data: 'aW5wdXQ=', mimeType: 'image/jpeg' } }, { text: 'retouch it' }] }],
      config: { responseModalities: ['IMAGE'] },
    })
  })

  it('editImage throws when Gemini returns no image', async () => {
    mockGenerateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'nope' }] } }] })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.editImage('aW5wdXQ=', 'image/jpeg', 'retouch it')).rejects.toThrow('Gemini returned no image')
  })
})
