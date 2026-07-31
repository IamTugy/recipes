import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { FavoritesService } from './favorites.service'
import { Favorite } from './schemas/favorite.schema'

describe('FavoritesService', () => {
  const findOneAndUpdate = jest.fn()
  const deleteOne = jest.fn()
  const find = jest.fn()

  const model = { findOneAndUpdate, deleteOne, find }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [FavoritesService, { provide: getModelToken(Favorite.name), useValue: model }],
    }).compile()
    return moduleRef.get(FavoritesService)
  }

  it('add upserts a favorite by userId+recipeSlug', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.add('user_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeSlug: 'a' },
      { userId: 'user_1', recipeSlug: 'a' },
      { upsert: true },
    )
  })

  it('remove deletes the favorite by userId+recipeSlug', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.remove('user_1', 'a')
    expect(deleteOne).toHaveBeenCalledWith({ userId: 'user_1', recipeSlug: 'a' })
  })

  it('listSlugs returns the recipeSlug of every favorite for a user', async () => {
    find.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ recipeSlug: 'a' }, { recipeSlug: 'b' }]) })
    const service = await makeService()
    await expect(service.listSlugs('user_1')).resolves.toEqual(['a', 'b'])
    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
  })
})
