import { ConfigService } from '@nestjs/config'
import { GeminiService } from './gemini.service'

const mockGenerateContent = jest.fn()

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
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
      model: 'gemini-2.5-flash',
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
    expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-2.5-flash', contents: 'say hi' })
  })
})
