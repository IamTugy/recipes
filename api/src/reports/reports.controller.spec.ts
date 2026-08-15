import { ForbiddenException } from '@nestjs/common'
import { ReportsController } from './reports.controller'

describe('ReportsController', () => {
  const reportsService = { create: jest.fn(), listAll: jest.fn(), resolve: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  function makeController(ownerUserId = 'admin_1') {
    const config = { get: jest.fn().mockReturnValue(ownerUserId) }
    return new ReportsController(reportsService as any, config as any)
  }

  it('GET /reports returns all reports for the app owner', async () => {
    reportsService.listAll.mockResolvedValue([{ recipeId: 'a' }])
    const controller = makeController()
    await expect(controller.list({ userId: 'admin_1' } as any)).resolves.toEqual([{ recipeId: 'a' }])
  })

  it('GET /reports throws 403 for a non-owner', async () => {
    const controller = makeController()
    await expect(controller.list({ userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
    expect(reportsService.listAll).not.toHaveBeenCalled()
  })

  it('PATCH /reports/:id resolves a report for the app owner', async () => {
    const controller = makeController()
    const result = await controller.resolve('report_1', { resolved: true }, { userId: 'admin_1' } as any)
    expect(reportsService.resolve).toHaveBeenCalledWith('report_1', true)
    expect(result).toEqual({ resolved: true })
  })

  it('PATCH /reports/:id throws 403 for a non-owner', async () => {
    const controller = makeController()
    await expect(controller.resolve('report_1', { resolved: true }, { userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
    expect(reportsService.resolve).not.toHaveBeenCalled()
  })
})
