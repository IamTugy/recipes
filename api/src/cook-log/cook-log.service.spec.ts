import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CookLogService } from './cook-log.service'
import { CookLog } from './schemas/cook-log.schema'

describe('CookLogService', () => {
  const findOneAndUpdate = jest.fn()
  const deleteOne = jest.fn()
  const find = jest.fn()
  const aggregate = jest.fn()

  const model = { findOneAndUpdate, deleteOne, find, aggregate }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [CookLogService, { provide: getModelToken(CookLog.name), useValue: model }],
    }).compile()
    return moduleRef.get(CookLogService)
  }

  it('markCooked upserts a cook log by userId+recipeSlug', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.markCooked('user_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeSlug: 'a' },
      { userId: 'user_1', recipeSlug: 'a' },
      { upsert: true },
    )
  })

  it('unmarkCooked deletes the cook log by userId+recipeSlug', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.unmarkCooked('user_1', 'a')
    expect(deleteOne).toHaveBeenCalledWith({ userId: 'user_1', recipeSlug: 'a' })
  })

  it('listSlugs returns the recipeSlug of every cook log for a user', async () => {
    find.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ recipeSlug: 'a' }, { recipeSlug: 'b' }]) })
    const service = await makeService()
    await expect(service.listSlugs('user_1')).resolves.toEqual(['a', 'b'])
    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
  })

  it('countsBySlug returns a count per recipe, defaulting to 0 for recipes with none in the map', async () => {
    aggregate.mockResolvedValue([{ _id: 'a', count: 3 }])
    const service = await makeService()
    const result = await service.countsBySlug(['a', 'b'])
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { recipeSlug: { $in: ['a', 'b'] } } },
      { $group: { _id: '$recipeSlug', count: { $sum: 1 } } },
    ])
    expect(result).toEqual(new Map([['a', 3]]))
  })
})
