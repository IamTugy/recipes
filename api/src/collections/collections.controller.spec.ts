import { CollectionsController } from './collections.controller'

describe('CollectionsController', () => {
  const collectionsService = {
    listForUser: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    addRecipe: jest.fn(),
    removeRecipe: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it("GET /collections returns the current user's collections", async () => {
    collectionsService.listForUser.mockResolvedValue([{ name: 'Desserts' }])
    const controller = new CollectionsController(collectionsService as any)
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual([{ name: 'Desserts' }])
    expect(collectionsService.listForUser).toHaveBeenCalledWith('user_1')
  })

  it('POST /collections creates a collection for the current user', async () => {
    collectionsService.create.mockResolvedValue({ name: 'Desserts' })
    const controller = new CollectionsController(collectionsService as any)
    const result = await controller.create({ name: 'Desserts' }, { userId: 'user_1' } as any)
    expect(collectionsService.create).toHaveBeenCalledWith('user_1', 'Desserts')
    expect(result).toEqual({ name: 'Desserts' })
  })

  it('DELETE /collections/:id removes the collection', async () => {
    const controller = new CollectionsController(collectionsService as any)
    const result = await controller.remove('col_1', { userId: 'user_1' } as any)
    expect(collectionsService.remove).toHaveBeenCalledWith('user_1', 'col_1')
    expect(result).toEqual({ deleted: true })
  })

  it('POST /collections/:id/recipes adds a recipe to the collection', async () => {
    collectionsService.addRecipe.mockResolvedValue({ recipeSlugs: ['a'] })
    const controller = new CollectionsController(collectionsService as any)
    const result = await controller.addRecipe('col_1', { slug: 'a' }, { userId: 'user_1' } as any)
    expect(collectionsService.addRecipe).toHaveBeenCalledWith('user_1', 'col_1', 'a')
    expect(result).toEqual({ recipeSlugs: ['a'] })
  })

  it('DELETE /collections/:id/recipes/:slug removes a recipe from the collection', async () => {
    collectionsService.removeRecipe.mockResolvedValue({ recipeSlugs: [] })
    const controller = new CollectionsController(collectionsService as any)
    const result = await controller.removeRecipe('col_1', 'a', { userId: 'user_1' } as any)
    expect(collectionsService.removeRecipe).toHaveBeenCalledWith('user_1', 'col_1', 'a')
    expect(result).toEqual({ recipeSlugs: [] })
  })
})
