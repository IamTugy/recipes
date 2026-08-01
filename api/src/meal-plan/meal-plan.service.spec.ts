import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { MealPlanService } from './meal-plan.service'
import { MealPlanEntry } from './schemas/meal-plan-entry.schema'

describe('MealPlanService', () => {
  async function makeService(model: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [MealPlanService, { provide: getModelToken(MealPlanEntry.name), useValue: model }],
    }).compile()
    return moduleRef.get(MealPlanService)
  }

  it('listForRange returns entries for the user within the date range, sorted by date', async () => {
    const entries = [{ _id: '1', date: '2026-08-03', recipeSlug: 'a', mealType: 'dinner' }]
    const lean = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(entries) })
    const sort = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    const result = await service.listForRange('user_1', '2026-08-03', '2026-08-09')

    expect(find).toHaveBeenCalledWith({ userId: 'user_1', date: { $gte: '2026-08-03', $lte: '2026-08-09' } })
    expect(sort).toHaveBeenCalledWith({ date: 1 })
    expect(result).toEqual([{ id: '1', date: '2026-08-03', recipeSlug: 'a', mealType: 'dinner' }])
  })

  it('add creates an entry defaulting mealType to dinner when not given', async () => {
    const create = jest.fn().mockResolvedValue({ _id: '1', date: '2026-08-03', recipeSlug: 'a', mealType: 'dinner' })
    const service = await makeService({ create })

    const result = await service.add('user_1', { date: '2026-08-03', recipeSlug: 'a' })

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', date: '2026-08-03', recipeSlug: 'a', mealType: 'dinner' })
    expect(result).toEqual({ id: '1', date: '2026-08-03', recipeSlug: 'a', mealType: 'dinner' })
  })

  it('add creates an entry with the given mealType', async () => {
    const create = jest.fn().mockResolvedValue({ _id: '1', date: '2026-08-03', recipeSlug: 'a', mealType: 'lunch' })
    const service = await makeService({ create })

    await service.add('user_1', { date: '2026-08-03', recipeSlug: 'a', mealType: 'lunch' })

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', date: '2026-08-03', recipeSlug: 'a', mealType: 'lunch' })
  })

  it('remove deletes an entry owned by the requesting user', async () => {
    const entry = { userId: 'user_1' }
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(entry) })
    const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ findById, deleteOne })

    await service.remove('user_1', '1')

    expect(deleteOne).toHaveBeenCalledWith({ _id: '1' })
  })

  it('remove throws NotFoundException when the entry does not exist', async () => {
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findById })
    await expect(service.remove('user_1', 'missing')).rejects.toThrow(NotFoundException)
  })

  it('remove throws ForbiddenException when the entry belongs to someone else', async () => {
    const entry = { userId: 'user_2' }
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(entry) })
    const deleteOne = jest.fn()
    const service = await makeService({ findById, deleteOne })

    await expect(service.remove('user_1', '1')).rejects.toThrow(ForbiddenException)
    expect(deleteOne).not.toHaveBeenCalled()
  })
})
