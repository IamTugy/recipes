import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { RecipeQualityService } from './recipe-quality.service'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeQualityService', () => {
  const generateStructuredWithImage = jest.fn()
  const gemini = { generateStructuredWithImage }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new Uint8Array(Buffer.from('image-bytes')).buffer,
    }) as unknown as typeof fetch
  })

  async function makeService() {
    const config = { get: jest.fn(() => 'https://recipes-assets.tugy.dev') }
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeQualityService,
        { provide: GeminiService, useValue: gemini },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()
    return moduleRef.get(RecipeQualityService)
  }

  const recipe = { image: 'https://recipes-assets.tugy.dev/recipes/x/photo.jpg', title: 'Soup' }

  it('scores 100 when there are no findings', async () => {
    generateStructuredWithImage.mockResolvedValue({ findings: [] })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100)
    expect(result.findings).toEqual([])
  })

  it('deducts fixed points per finding by severity', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'image', severity: 'critical', message: 'blurry' },
        { category: 'translation', severity: 'major', message: 'missing english' },
        { category: 'polish', severity: 'minor', message: 'typo' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100 - 25 - 10 - 3)
  })

  it('floors the score at 0 rather than going negative', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'a', severity: 'critical', message: '1' },
        { category: 'b', severity: 'critical', message: '2' },
        { category: 'c', severity: 'critical', message: '3' },
        { category: 'd', severity: 'critical', message: '4' },
        { category: 'e', severity: 'critical', message: '5' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(0)
  })

  it('passes suggestedFields through from the Gemini response', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [{ category: 'translation', severity: 'minor', message: 'awkward phrasing' }],
      suggestedFields: { descriptionEn: 'A better description.' },
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.suggestedFields).toEqual({ descriptionEn: 'A better description.' })
  })

  it('sends the recipe image and JSON to Gemini', async () => {
    generateStructuredWithImage.mockResolvedValue({ findings: [] })
    const service = await makeService()

    await service.review(recipe)

    expect(global.fetch).toHaveBeenCalledWith(recipe.image)
    const [prompt, imageData, mimeType, temperature] = generateStructuredWithImage.mock.calls[0]
    expect(prompt).toContain(JSON.stringify(recipe))
    expect(imageData).toBe(Buffer.from('image-bytes').toString('base64'))
    expect(mimeType).toBe('image/jpeg')
    expect(temperature).toBe(0)
  })

  it('rejects image URLs outside of our own bucket', async () => {
    const service = await makeService()

    await expect(service.review({ ...recipe, image: 'https://evil.example.com/steal.jpg' }))
      .rejects.toThrow('Recipe image must be an uploaded photo')
    expect(generateStructuredWithImage).not.toHaveBeenCalled()
  })

  it('throws when the recipe image cannot be fetched', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    const service = await makeService()

    await expect(service.review(recipe)).rejects.toThrow('Could not fetch the recipe image')
  })
})
