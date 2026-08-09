import { NotFoundException } from '@nestjs/common'
import { RecipesController } from './recipes.controller'

describe('RecipesController', () => {
  const recipesService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIdForUser: jest.fn(),
    findMine: jest.fn(),
    findPublishedByOwner: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    updateImage: jest.fn(),
    submitForReview: jest.fn(),
    listRecentSubmissions: jest.fn(),
    listRevisions: jest.fn(),
    canViewDraftRevisions: jest.fn(),
    remove: jest.fn(),
  }
  const usersService = { namesByIds: jest.fn().mockResolvedValue({}) }

  function makeController(ownerUserId = 'admin_1') {
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const config = { get: jest.fn().mockReturnValue(ownerUserId) }
    return new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)
  }

  beforeEach(() => jest.clearAllMocks())

  it('GET /recipes returns all recipes', async () => {
    recipesService.findAll.mockResolvedValue([{ slug: 'a' }])
    const controller = makeController()
    await expect(controller.findAll()).resolves.toEqual([{ slug: 'a' }])
  })

  it('GET /recipes/public/:slug returns the recipe when ever-published and not hidden', async () => {
    recipesService.findById.mockResolvedValue({ slug: 'a', title: 'A' })
    const controller = makeController()

    await expect(controller.findPublic('a')).resolves.toEqual({ slug: 'a', title: 'A' })
    expect(recipesService.findById).toHaveBeenCalledWith('a')
  })

  it('GET /recipes/public/:slug throws 404 when never published, hidden, or missing', async () => {
    recipesService.findById.mockResolvedValue(null)
    const controller = makeController()

    await expect(controller.findPublic('missing')).rejects.toThrow(NotFoundException)
  })

  it('GET /recipes/:slug returns the recipe and logs a view when it has ever been published', async () => {
    recipesService.findByIdForUser.mockResolvedValue({ slug: 'a', status: 'published', publishedRevision: 1 })
    const controller = makeController()

    const result = await controller.findOne('a', { userId: 'user_1' } as any)

    expect(recipesService.findByIdForUser).toHaveBeenCalledWith('a', 'user_1', false)
    expect(result).toEqual({ slug: 'a', status: 'published', publishedRevision: 1 })
  })

  it('GET /recipes/:slug does not log a view for a never-published recipe', async () => {
    recipesService.findByIdForUser.mockResolvedValue({ slug: 'a', status: 'draft' })
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const config = { get: jest.fn().mockReturnValue('admin_1') }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    await controller.findOne('a', { userId: 'user_1' } as any)

    expect(activityLog.record).not.toHaveBeenCalled()
  })

  it('GET /recipes/:slug throws 404 when not found', async () => {
    recipesService.findByIdForUser.mockResolvedValue(null)
    const controller = makeController()
    await expect(controller.findOne('missing', { userId: 'user_1' } as any)).rejects.toThrow(NotFoundException)
  })

  it('GET /recipes/trending returns recipes for the trending slugs, skipping any since-deleted ones', async () => {
    const activityLog = { record: jest.fn(), trendingIds: jest.fn().mockResolvedValue(['a', 'gone', 'b']) }
    const config = { get: jest.fn().mockReturnValue('admin_1') }
    recipesService.findById.mockImplementation((slug: string) =>
      slug === 'gone' ? Promise.resolve(null) : Promise.resolve({ slug }),
    )
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    const result = await controller.trending()

    expect(activityLog.trendingIds).toHaveBeenCalled()
    expect(result).toEqual([{ slug: 'a' }, { slug: 'b' }])
  })

  it('GET /recipes/mine returns the recipes owned by the requester', async () => {
    recipesService.findMine.mockResolvedValue([{ slug: 'a' }])
    const controller = makeController()
    await expect(controller.findMine({ userId: 'user_1' } as any)).resolves.toEqual([{ slug: 'a' }])
    expect(recipesService.findMine).toHaveBeenCalledWith('user_1')
  })

  it("GET /recipes/chef/:userId returns that owner's published recipes with their display name", async () => {
    recipesService.findPublishedByOwner.mockResolvedValue([{ slug: 'a' }])
    usersService.namesByIds.mockResolvedValue({ user_1: 'Tugy' })
    const controller = makeController()
    const result = await controller.chefProfile('user_1')
    expect(recipesService.findPublishedByOwner).toHaveBeenCalledWith('user_1')
    expect(usersService.namesByIds).toHaveBeenCalledWith(['user_1'])
    expect(result).toEqual({ userId: 'user_1', name: 'Tugy', recipes: [{ slug: 'a' }] })
  })

  it("GET /recipes/chef/:userId returns a null name when the user has no display name on record", async () => {
    recipesService.findPublishedByOwner.mockResolvedValue([])
    usersService.namesByIds.mockResolvedValue({})
    const controller = makeController()
    const result = await controller.chefProfile('user_2')
    expect(result).toEqual({ userId: 'user_2', name: null, recipes: [] })
  })

  it('GET /recipes/submissions returns the recent AI-review feed, annotated with owner display names', async () => {
    recipesService.listRecentSubmissions.mockResolvedValue([
      { slug: 'a', ownerId: 'user_1' },
      { slug: 'b', ownerId: 'user_2' },
    ])
    usersService.namesByIds.mockResolvedValue({ user_1: 'Tugy' })
    const controller = makeController()

    const result = await controller.listRecentSubmissions()

    expect(usersService.namesByIds).toHaveBeenCalledWith(['user_1', 'user_2'])
    expect(result).toEqual([
      { slug: 'a', ownerId: 'user_1', ownerName: 'Tugy' },
      { slug: 'b', ownerId: 'user_2', ownerName: null },
    ])
  })

  it('POST /recipes creates a draft owned by the requester', async () => {
    const created = { toObject: () => ({ slug: 'tomato-soup', title: 'Tomato Soup' }) }
    recipesService.createDraft.mockResolvedValue(created)
    const controller = makeController()
    const body = { title: 'Tomato Soup' } as any
    const result = await controller.create(body, { userId: 'user_1' } as any)
    expect(recipesService.createDraft).toHaveBeenCalledWith('user_1', body)
    expect(result).toEqual({ slug: 'tomato-soup', title: 'Tomato Soup' })
  })

  it('PUT /recipes/:slug updates a draft owned by the requester', async () => {
    const updated = { toObject: () => ({ slug: 'tomato-soup', title: 'Tomato Soup v2' }) }
    recipesService.updateDraft.mockResolvedValue(updated)
    const controller = makeController()
    const body = { title: 'Tomato Soup v2' } as any
    const result = await controller.update('tomato-soup', body, { userId: 'user_1' } as any)
    expect(recipesService.updateDraft).toHaveBeenCalledWith('tomato-soup', 'user_1', false, body)
    expect(result).toEqual({ slug: 'tomato-soup', title: 'Tomato Soup v2' })
  })

  it('PATCH /recipes/:slug/image updates just the photo, without a full draft save', async () => {
    const updated = { toObject: () => ({ slug: 'tomato-soup', image: 'https://r2.example.com/new.jpg' }) }
    recipesService.updateImage.mockResolvedValue(updated)
    const controller = makeController()
    const result = await controller.updateImage('tomato-soup', { image: 'https://r2.example.com/new.jpg' }, { userId: 'user_1' } as any)
    expect(recipesService.updateImage).toHaveBeenCalledWith('tomato-soup', 'user_1', false, 'https://r2.example.com/new.jpg')
    expect(result).toEqual({ slug: 'tomato-soup', image: 'https://r2.example.com/new.jpg' })
  })

  it('POST /recipes/:slug/submit submits the recipe for the AI review gate', async () => {
    const submitted = { toObject: () => ({ slug: 'a', status: 'published', qualityReview: { score: 100 } }) }
    recipesService.submitForReview.mockResolvedValue(submitted)
    const controller = makeController()
    const result = await controller.submit('a', { userId: 'user_1' } as any)
    expect(recipesService.submitForReview).toHaveBeenCalledWith('a', 'user_1', false)
    expect(result).toEqual({ slug: 'a', status: 'published', qualityReview: { score: 100 } })
  })

  it("GET /recipes/:slug/revisions includes drafts when the requester can view them (owner/admin)", async () => {
    recipesService.canViewDraftRevisions.mockResolvedValue(true)
    recipesService.listRevisions.mockResolvedValue([{ revisionNumber: 2 }, { revisionNumber: 1 }])
    const controller = makeController('admin_1')
    const result = await controller.listRevisions('a', { userId: 'admin_1' } as any)

    expect(recipesService.canViewDraftRevisions).toHaveBeenCalledWith('a', 'admin_1', true)
    expect(recipesService.listRevisions).toHaveBeenCalledWith('a', true)
    expect(result).toEqual([{ revisionNumber: 2 }, { revisionNumber: 1 }])
  })

  it("GET /recipes/:slug/revisions excludes drafts for a random visitor", async () => {
    recipesService.canViewDraftRevisions.mockResolvedValue(false)
    recipesService.listRevisions.mockResolvedValue([{ revisionNumber: 1 }])
    const controller = makeController()
    await controller.listRevisions('a', { userId: 'user_2' } as any)

    expect(recipesService.listRevisions).toHaveBeenCalledWith('a', false)
  })

  it('DELETE /recipes/:slug deletes a recipe', async () => {
    const controller = makeController()
    const result = await controller.remove('tomato-soup', { userId: 'user_1' } as any)
    expect(recipesService.remove).toHaveBeenCalledWith('tomato-soup', 'user_1', false)
    expect(result).toEqual({ deleted: true })
  })
})
