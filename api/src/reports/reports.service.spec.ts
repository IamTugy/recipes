import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ReportsService } from './reports.service'
import { Report } from './schemas/report.schema'

describe('ReportsService', () => {
  const findOneAndUpdate = jest.fn()
  const find = jest.fn()
  const updateOne = jest.fn()

  const model = { findOneAndUpdate, find, updateOne }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [ReportsService, { provide: getModelToken(Report.name), useValue: model }],
    }).compile()
    return moduleRef.get(ReportsService)
  }

  it('create upserts a report by recipeId+reporterId, reopening it if previously resolved', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.create('recipe_1', 'user_1', 'spam', 'looks fake')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { recipeId: 'recipe_1', reporterId: 'user_1' },
      { recipeId: 'recipe_1', reporterId: 'user_1', reason: 'spam', message: 'looks fake', resolved: false },
      { upsert: true },
    )
  })

  it('listAll returns every report, most recent first', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ recipeId: 'a' }]) })
    find.mockReturnValue({ sort })
    const service = await makeService()
    await expect(service.listAll()).resolves.toEqual([{ recipeId: 'a' }])
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
  })

  it('resolve updates the resolved flag by id', async () => {
    updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.resolve('report_1', true)
    expect(updateOne).toHaveBeenCalledWith({ _id: 'report_1' }, { $set: { resolved: true } })
  })
})
