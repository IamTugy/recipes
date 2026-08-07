import { BadRequestException } from '@nestjs/common'
import { MealPlanController } from './meal-plan.controller'

describe('MealPlanController', () => {
  const mealPlanService = { listForRange: jest.fn(), add: jest.fn(), remove: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('GET /meal-plan returns entries for the given range', async () => {
    mealPlanService.listForRange.mockResolvedValue([{ id: '1' }])
    const controller = new MealPlanController(mealPlanService as any)
    const result = await controller.list('2026-08-03', '2026-08-09', { userId: 'user_1' } as any)
    expect(mealPlanService.listForRange).toHaveBeenCalledWith('user_1', '2026-08-03', '2026-08-09')
    expect(result).toEqual([{ id: '1' }])
  })

  it('GET /meal-plan throws BadRequestException when start or end is missing', async () => {
    const controller = new MealPlanController(mealPlanService as any)
    await expect(controller.list('', '2026-08-09', { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('POST /meal-plan adds an entry for the requesting user', async () => {
    const body = { date: '2026-08-03', recipeId: 'a' } as any
    mealPlanService.add.mockResolvedValue({ id: '1', ...body, mealType: 'dinner' })
    const controller = new MealPlanController(mealPlanService as any)
    const result = await controller.add(body, { userId: 'user_1' } as any)
    expect(mealPlanService.add).toHaveBeenCalledWith('user_1', body)
    expect(result).toEqual({ id: '1', date: '2026-08-03', recipeId: 'a', mealType: 'dinner' })
  })

  it('DELETE /meal-plan/:id removes the entry', async () => {
    const controller = new MealPlanController(mealPlanService as any)
    const result = await controller.remove('1', { userId: 'user_1' } as any)
    expect(mealPlanService.remove).toHaveBeenCalledWith('user_1', '1')
    expect(result).toEqual({ deleted: true })
  })
})
