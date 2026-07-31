import { FavoritesController } from './favorites.controller'

describe('FavoritesController', () => {
  const favoritesService = { add: jest.fn(), remove: jest.fn(), listSlugs: jest.fn() }
  const activityLog = { record: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it("GET /favorites returns the current user's favorite slugs", async () => {
    favoritesService.listSlugs.mockResolvedValue(['a', 'b'])
    const controller = new FavoritesController(favoritesService as any, activityLog as any)
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual(['a', 'b'])
  })

  it('POST /favorites/:slug adds the favorite and logs the action', async () => {
    const controller = new FavoritesController(favoritesService as any, activityLog as any)
    const result = await controller.add('a', { userId: 'user_1' } as any)
    expect(favoritesService.add).toHaveBeenCalledWith('user_1', 'a')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'favorited')
    expect(result).toEqual({ favorited: true })
  })

  it('DELETE /favorites/:slug removes the favorite and logs the action', async () => {
    const controller = new FavoritesController(favoritesService as any, activityLog as any)
    const result = await controller.remove('a', { userId: 'user_1' } as any)
    expect(favoritesService.remove).toHaveBeenCalledWith('user_1', 'a')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'unfavorited')
    expect(result).toEqual({ favorited: false })
  })
})
