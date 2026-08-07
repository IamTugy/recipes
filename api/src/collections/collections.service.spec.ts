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
    create.mockResolvedValue({ name: 'Desserts', recipeIds: [] })
    const service = await makeService()
    const result = await service.create('user_1', 'Desserts')
    expect(create).toHaveBeenCalledWith({ userId: 'user_1', name: 'Desserts', recipeIds: [] })
    expect(result).toEqual({ name: 'Desserts', recipeIds: [] })
  })

  it("rename updates only the requesting user's collection name", async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ name: 'Desserts (new)' }) })
    const service = await makeService()
    const result = await service.rename('user_1', 'col_1', 'Desserts (new)')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'col_1', userId: 'user_1' },
      { name: 'Desserts (new)' },
      { new: true },
    )
    expect(result).toEqual({ name: 'Desserts (new)' })
  })

  it('remove deletes only the requesting user\'s collection', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.remove('user_1', 'col_1')
    expect(deleteOne).toHaveBeenCalledWith({ _id: 'col_1', userId: 'user_1' })
  })

  it('addRecipe adds a slug to the collection without duplicating it', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ recipeIds: ['a'] }) })
    const service = await makeService()
    const result = await service.addRecipe('user_1', 'col_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'col_1', userId: 'user_1' },
      { $addToSet: { recipeIds: 'a' } },
      { new: true },
    )
    expect(result).toEqual({ recipeIds: ['a'] })
  })

  it('removeRecipe pulls a slug out of the collection', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ recipeIds: [] }) })
    const service = await makeService()
    const result = await service.removeRecipe('user_1', 'col_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'col_1', userId: 'user_1' },
      { $pull: { recipeIds: 'a' } },
      { new: true },
    )
    expect(result).toEqual({ recipeIds: [] })
  })
})
