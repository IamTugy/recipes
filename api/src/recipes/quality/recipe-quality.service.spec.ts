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

  it('deducts fixed points per finding by severity, for required findings only', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'image', severity: 'critical', bucket: 'required', message: 'blurry' },
        { category: 'translation', severity: 'major', bucket: 'required', message: 'missing english' },
        { category: 'polish', severity: 'minor', bucket: 'required', message: 'typo' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100 - 25 - 10 - 3)
  })

  it('does not deduct points for suggestion-bucket findings, regardless of severity', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'seasoning', severity: 'major', bucket: 'suggestion', message: 'less MSG would be nicer' },
        { category: 'polish', severity: 'critical', bucket: 'suggestion', message: 'stylistic nit' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100)
  })

  it('deducts points for a finding with a missing/malformed bucket, defaulting to required rather than silently dropping it from scoring', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [{ category: 'translation', severity: 'major', message: 'missing english' }],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100 - 10)
  })

  it('floors the score at 0 rather than going negative', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'a', severity: 'critical', bucket: 'required', message: '1' },
        { category: 'b', severity: 'critical', bucket: 'required', message: '2' },
        { category: 'c', severity: 'critical', bucket: 'required', message: '3' },
        { category: 'd', severity: 'critical', bucket: 'required', message: '4' },
        { category: 'e', severity: 'critical', bucket: 'required', message: '5' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(0)
  })

  it('passes each finding through including its own suggestedFix', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'translation', severity: 'minor', bucket: 'required', message: 'awkward phrasing', field: 'descriptionEn', suggestedFix: { descriptionEn: 'A better description.' } },
        { category: 'seasoning', severity: 'minor', bucket: 'suggestion', message: 'less MSG' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.findings[0].suggestedFix).toEqual({ descriptionEn: 'A better description.' })
    expect(result.findings[1].suggestedFix).toBeUndefined()
  })

  it('drops a suggestedFix for ingredients/steps that is drastically shorter than the original (likely a truncated echo)', async () => {
    const longRecipe = { ...recipe, ingredients: ['a', 'b', 'c', 'd', 'e'], steps: ['1', '2', '3', '4', '5'] }
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'consistency', severity: 'major', bucket: 'required', message: 'ingredient mismatch', field: 'ingredients', suggestedFix: { ingredients: ['a', 'b'] } },
        { category: 'consistency', severity: 'major', bucket: 'required', message: 'missing steps', field: 'steps', suggestedFix: { steps: ['1', '2', '3'] } },
      ],
    })
    const service = await makeService()

    const result = await service.review(longRecipe)

    expect(result.findings[0].suggestedFix).toBeUndefined()
    expect(result.findings[1].suggestedFix).toBeUndefined()
  })

  it('keeps a suggestedFix that only drops one item, e.g. removing a duplicate', async () => {
    const longRecipe = { ...recipe, ingredients: ['a', 'b', 'c', 'd', 'e'] }
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'consistency', severity: 'minor', bucket: 'required', message: 'duplicate ingredient', field: 'ingredients', suggestedFix: { ingredients: ['a', 'b', 'c', 'd'] } },
      ],
    })
    const service = await makeService()

    const result = await service.review(longRecipe)

    expect(result.findings[0].suggestedFix).toEqual({ ingredients: ['a', 'b', 'c', 'd'] })
  })

  it('drops only the truncated array field from a suggestedFix, keeping other fields on it', async () => {
    const longRecipe = { ...recipe, steps: ['1', '2', '3', '4', '5'] }
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        {
          category: 'consistency', severity: 'major', bucket: 'required', message: 'multiple issues',
          suggestedFix: { steps: ['1'], descriptionEn: 'A better description.' },
        },
      ],
    })
    const service = await makeService()

    const result = await service.review(longRecipe)

    expect(result.findings[0].suggestedFix).toEqual({ descriptionEn: 'A better description.' })
  })

  it('drops suggestedFix keys that are not real field names, e.g. the model mirroring a deep field pointer into numeric keys', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        {
          category: 'consistency', severity: 'major', bucket: 'required', field: 'ingredients.4.6', message: 'wrong tomato type',
          suggestedFix: { '0': { group: 'a' }, '4': { group: 'e' }, ingredients: [{ group: 'fixed', items: [] }] },
        },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.findings[0].suggestedFix).toEqual({ ingredients: [{ group: 'fixed', items: [] }] })
  })

  it('drops a suggestedFix entirely when none of its keys are real field names', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        {
          category: 'consistency', severity: 'major', bucket: 'required', field: 'ingredients.1.1', message: 'wrong unit',
          suggestedFix: { '0': { group: 'a' }, '1': { group: 'b' } },
        },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.findings[0].suggestedFix).toBeUndefined()
  })

  it('drops a suggestedFix whose ingredients/steps value is not an array at all, not just too short', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        {
          category: 'consistency', severity: 'major', bucket: 'required', field: 'ingredients', message: 'malformed fix',
          suggestedFix: { ingredients: 'not an array', descriptionEn: 'still a valid fix' },
        },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.findings[0].suggestedFix).toEqual({ descriptionEn: 'still a valid fix' })
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
