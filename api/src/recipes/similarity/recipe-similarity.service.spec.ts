import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipeSimilarityService } from './recipe-similarity.service'
import { Recipe } from '../schemas/recipe.schema'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeSimilarityService', () => {
  const generateStructured = jest.fn()
  const gemini = { generateStructured }

  function makeOther(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => 'other-id' },
      title: 'Something Else',
      titleHe: undefined,
      ingredients: [{ items: [{ name: 'Nothing Shared', unit: 'g', amount: 1 }] }],
      steps: [],
      ...overrides,
    }
  }

  async function makeService(others: Record<string, unknown>[]) {
    const exec = jest.fn().mockResolvedValue(others)
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ select })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeSimilarityService,
        { provide: getModelToken(Recipe.name), useValue: { find } },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile()
    return { service: moduleRef.get(RecipeSimilarityService), find }
  }

  beforeEach(() => jest.clearAllMocks())

  const newRecipe = {
    title: 'Chocolate Chip Cookies',
    titleHe: undefined,
    ownerId: 'user_1',
    ingredients: [{ items: [{ name: 'Flour', unit: 'g', amount: 300 }, { name: 'Sugar', unit: 'g', amount: 200 }] }],
    steps: [{ items: [{ instruction: 'Mix and bake' }] }],
  }

  it('queries recipes owned by the submitter or ever-published, excluding the submission itself', async () => {
    const { service, find } = await makeService([])
    await service.findCandidates(newRecipe, 'self-id')

    expect(find).toHaveBeenCalledWith({
      _id: { $ne: 'self-id' },
      deletedAt: { $exists: false },
      $or: [{ ownerId: 'user_1' }, { publishedRevision: { $ne: null }, hidden: { $ne: true } }],
    })
  })

  it('excludes recipes that cross none of the similarity thresholds', async () => {
    const { service } = await makeService([makeOther()])
    const candidates = await service.findCandidates(newRecipe, 'self-id')
    expect(candidates).toEqual([])
  })

  it('includes a recipe whose title crosses the title threshold, mapped to the candidate shape', async () => {
    const other = makeOther({ _id: { toString: () => 'twin-id' }, title: 'Chocolate Chip Cookie' })
    const { service } = await makeService([other])
    const candidates = await service.findCandidates(newRecipe, 'self-id')
    expect(candidates).toEqual([{ id: 'twin-id', title: 'Chocolate Chip Cookie', titleHe: undefined, ingredients: other.ingredients, steps: other.steps }])
  })

  it('sorts candidates by best matching score, highest first, and caps at 5', async () => {
    const strongMatch = makeOther({ _id: { toString: () => 'strong' }, title: 'Chocolate Chip Cookies' }) // title score 1
    const weakMatches = Array.from({ length: 5 }, (_, i) => makeOther({
      _id: { toString: () => `weak-${i}` },
      title: 'Chocolate Chip Cookie', // slightly lower title score than an exact match
    }))
    const { service } = await makeService([...weakMatches, strongMatch])
    const candidates = await service.findCandidates(newRecipe, 'self-id')
    expect(candidates).toHaveLength(5)
    expect(candidates[0].id).toBe('strong')
  })

  it('judge sends the new recipe and candidates to Gemini at temperature 0 and returns its verdict', async () => {
    generateStructured.mockResolvedValue({ isDuplicate: true, matchedRecipeId: 'twin-id', reason: 'same dish, rescaled' })
    const { service } = await makeService([])
    const candidates = [{ id: 'twin-id', title: 'Chocolate Chip Cookie', titleHe: undefined, ingredients: [], steps: [] }]

    const verdict = await service.judge(newRecipe, candidates)

    expect(verdict).toEqual({ isDuplicate: true, matchedRecipeId: 'twin-id', reason: 'same dish, rescaled' })
    expect(generateStructured).toHaveBeenCalledTimes(1)
    const [prompt, temperature] = generateStructured.mock.calls[0]
    expect(temperature).toBe(0)
    expect(prompt).toContain('Chocolate Chip Cookies')
    expect(prompt).toContain('twin-id')
  })
})
