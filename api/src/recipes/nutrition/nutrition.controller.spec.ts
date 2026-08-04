import { NutritionController } from './nutrition.controller'
import { NutritionService } from './nutrition.service'

describe('NutritionController', () => {
  const nutritionService = { estimate: jest.fn() }
  const controller = new NutritionController(nutritionService as unknown as NutritionService)

  beforeEach(() => jest.clearAllMocks())

  it('delegates to the nutrition service', async () => {
    const body = { ingredients: [{ group: '', items: [{ amount: 1, unit: 'cup', name: 'rice' }] }], servings: 2 }
    nutritionService.estimate.mockResolvedValue({ calories: 200 })

    const result = await controller.estimate(body)

    expect(nutritionService.estimate).toHaveBeenCalledWith(body)
    expect(result).toEqual({ calories: 200 })
  })
})
