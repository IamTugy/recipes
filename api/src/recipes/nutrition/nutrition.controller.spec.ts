import { NutritionController } from './nutrition.controller'
import { NutritionService } from './nutrition.service'

describe('NutritionController', () => {
  const nutritionService = { estimate: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new NutritionController(nutritionService as unknown as NutritionService, activityLog as any)

  beforeEach(() => jest.clearAllMocks())

  it('delegates to the nutrition service', async () => {
    const body = { ingredients: [{ group: '', items: [{ amount: 1, unit: 'cup', name: 'rice' }] }], servings: 2 }
    nutritionService.estimate.mockResolvedValue({ calories: 200 })

    const result = await controller.estimate(body, { userId: 'user_1' } as any)

    expect(nutritionService.estimate).toHaveBeenCalledWith(body)
    expect(result).toEqual({ calories: 200 })
  })

  it('logs an ai_nutrition_estimate_used event', async () => {
    const body = { ingredients: [{ group: '', items: [{ amount: 1, unit: 'cup', name: 'rice' }] }] }
    nutritionService.estimate.mockResolvedValue({ calories: 200 })

    await controller.estimate(body, { userId: 'user_1' } as any)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_nutrition_estimate_used')
  })
})
