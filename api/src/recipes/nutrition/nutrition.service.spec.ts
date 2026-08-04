import { GeminiService } from '../../ai/gemini.service'
import { NutritionService } from './nutrition.service'

describe('NutritionService', () => {
  const gemini = { generateStructured: jest.fn() }
  const service = new NutritionService(gemini as unknown as GeminiService)

  beforeEach(() => jest.clearAllMocks())

  it('estimates nutrition from the ingredient list and servings', async () => {
    gemini.generateStructured.mockResolvedValue({ calories: 350, protein: 20, carbs: 40, fat: 10 })

    const result = await service.estimate({
      ingredients: [{ group: '', items: [{ amount: 200, unit: 'g', name: 'chicken' }] }],
      servings: 4,
    })

    expect(result).toEqual({ calories: 350, protein: 20, carbs: 40, fat: 10 })
    const [prompt] = gemini.generateStructured.mock.calls[0]
    expect(prompt).toContain('Servings: 4')
    expect(prompt).toContain('200 g chicken')
  })

  it('falls back to an assumed serving count when servings is not provided', async () => {
    gemini.generateStructured.mockResolvedValue({ calories: 100 })

    await service.estimate({ ingredients: [{ group: '', items: [{ amount: 1, unit: '', name: 'egg' }] }] })

    const [prompt] = gemini.generateStructured.mock.calls[0]
    expect(prompt).toContain('Servings: unknown, assume 4')
  })
})
