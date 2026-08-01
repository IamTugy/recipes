import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { CollectionsService } from './collections.service'
import { Collection } from './schemas/collection.schema'

describe('CollectionsService', () => {
  const find = jest.fn()
  const create = jest.fn()
  const deleteOne = jest.fn()
  const findOneAndUpdate = jest.fn()

  const model = { find, create, deleteOne, findOneAndUpdate }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [CollectionsService, { provide: getModelToken(Collection.name), useValue: model }],
    }).compile()
    return moduleRef.get(CollectionsService)
  }

  it("listForUser returns the user's collections, newest first", async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ name: 'Weeknight dinners' }]) })
    find.mockReturnValue({ sort })
    const service = await makeService()
    const result = await service.listForUser('user_1')
    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(result).toEqual([{ name: 'Weeknight dinners' }])
  })

  it('create makes a new empty collection for the user', async () => {
    create.mockResolvedValue({ name: 'Desserts', recipeSlugs: [] })
    const service = await makeService()
    const result = await service.create('user_1', 'Desserts')
    expect(create).toHaveBeenCalledWith({ userId: 'user_1', name: 'Desserts', recipeSlugs: [] })
    expect(result).toEqual({ name: 'Desserts', recipeSlugs: [] })
  })

  it('remove deletes only the requesting user\'s collection', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.remove('user_1', 'col_1')
    expect(deleteOne).toHaveBeenCalledWith({ _id: 'col_1', userId: 'user_1' })
  })

  it('addRecipe adds a slug to the collection without duplicating it', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ recipeSlugs: ['a'] }) })
    const service = await makeService()
    const result = await service.addRecipe('user_1', 'col_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'col_1', userId: 'user_1' },
      { $addToSet: { recipeSlugs: 'a' } },
      { new: true },
    )
    expect(result).toEqual({ recipeSlugs: ['a'] })
  })

  it('removeRecipe pulls a slug out of the collection', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ recipeSlugs: [] }) })
    const service = await makeService()
    const result = await service.removeRecipe('user_1', 'col_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'col_1', userId: 'user_1' },
      { $pull: { recipeSlugs: 'a' } },
      { new: true },
    )
    expect(result).toEqual({ recipeSlugs: [] })
  })
})
