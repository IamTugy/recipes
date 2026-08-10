import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipesService } from './recipes.service'
import { Recipe } from './schemas/recipe.schema'
import { RecipeRevision } from './schemas/recipe-revision.schema'
import { Rating } from '../ratings/schemas/rating.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { CookLogService } from '../cook-log/cook-log.service'
import { UsersService } from '../users/users.service'
import { RecipeQualityService } from './quality/recipe-quality.service'

describe('RecipesService', () => {
  function makeActivityLog(viewCounts: Map<string, number> = new Map()) {
    return { viewCountsById: jest.fn().mockResolvedValue(viewCounts), record: jest.fn().mockResolvedValue(undefined) }
  }

  function makeCookLog(cookCounts: Map<string, number> = new Map()) {
    return { countsById: jest.fn().mockResolvedValue(cookCounts) }
  }

  function makeUsers() {
    return { namesByIds: jest.fn().mockResolvedValue({}) }
  }

  function noUnownedRecipes(overrides: Record<string, unknown> = {}) {
    return { find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }), ...overrides }
  }

  function noRevisionFound() {
    return { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(null) }) }) }
  }

  function makeQualityService(review: Record<string, unknown> = { score: 100, checkedAt: 'now', findings: [] }) {
    return { review: jest.fn().mockResolvedValue(review) }
  }

  async function makeService(
    recipeModel: Record<string, unknown>,
    revisionModel: Record<string, unknown> = noRevisionFound(),
    ratingModel: Record<string, unknown> = { aggregate: jest.fn().mockResolvedValue([]) },
    activityLog = makeActivityLog(),
    cookLog = makeCookLog(),
    config: Record<string, unknown> = { get: jest.fn().mockReturnValue('owner_1') },
    usersService = makeUsers(),
    qualityService = makeQualityService(),
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: getModelToken(RecipeRevision.name), useValue: revisionModel },
        { provide: getModelToken(Rating.name), useValue: ratingModel },
        { provide: ActivityLogService, useValue: activityLog },
        { provide: CookLogService, useValue: cookLog },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: config },
        { provide: RecipeQualityService, useValue: qualityService },
      ],
    }).compile()
    return moduleRef.get(RecipesService)
  }

  it('onModuleInit backfills status=published on recipes stored before that field existed', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 })
    const service = await makeService({ updateMany, ...noUnownedRecipes() })
    await service.onModuleInit()

    expect(updateMany).toHaveBeenCalledWith(
      { status: { $exists: false } },
      { $set: { status: 'published', currentRevision: 0 } },
    )
  })

  it('onModuleInit backfills publishedRevision from currentRevision on recipes already marked published', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 })
    const service = await makeService({ updateMany, ...noUnownedRecipes() })
    await service.onModuleInit()

    expect(updateMany).toHaveBeenCalledWith(
      { status: 'published', publishedRevision: { $exists: false } },
      [{ $set: { publishedRevision: '$currentRevision' } }],
    )
  })

  it('onModuleInit does nothing further when OWNER_USER_ID is not configured', async () => {
    const find = jest.fn()
    const service = await makeService(
      { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }), find },
      undefined, undefined, undefined, undefined,
      { get: jest.fn().mockReturnValue(undefined) },
    )
    await service.onModuleInit()
    expect(find).not.toHaveBeenCalled()
  })

  it('onModuleInit assigns ownership to legacy recipes, publishing only ones the owner already rated', async () => {
    const unowned = [
      { id: 'rated-recipe', slug: 'rated-recipe', title: 'Rated Recipe' },
      { id: 'other-recipe', slug: 'other-recipe', title: 'Other Recipe' },
    ]
    const find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(unowned) })
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 })
    const distinct = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(['rated-recipe']) })
    const exists = jest.fn().mockResolvedValue(null)
    const create = jest.fn().mockResolvedValue({})

    const service = await makeService(
      { updateMany, find },
      { exists, create },
      { aggregate: jest.fn().mockResolvedValue([]), distinct },
    )
    await service.onModuleInit()

    expect(find).toHaveBeenCalledWith({ ownerId: { $exists: false } })
    expect(distinct).toHaveBeenCalledWith('recipeId', { userId: 'owner_1' })
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['rated-recipe', 'other-recipe'] } },
      { $set: { ownerId: 'owner_1' } },
    )
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['other-recipe'] } },
      { $set: { status: 'draft', currentRevision: 0 } },
    )
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['rated-recipe'] } },
      { $set: { status: 'published', currentRevision: 1, publishedRevision: 1 } },
    )
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      recipeId: 'rated-recipe', revisionNumber: 1, authorId: 'owner_1', published: true,
    }))
  })

  it('onModuleInit does not create a duplicate revision-1 snapshot when one already exists', async () => {
    const unowned = [{ id: 'rated-recipe', slug: 'rated-recipe', title: 'Rated Recipe' }]
    const find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(unowned) })
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 })
    const distinct = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(['rated-recipe']) })
    const exists = jest.fn().mockResolvedValue({ _id: 'existing' })
    const create = jest.fn()

    const service = await makeService(
      { updateMany, find },
      { exists, create },
      { aggregate: jest.fn().mockResolvedValue([]), distinct },
    )
    await service.onModuleInit()

    expect(create).not.toHaveBeenCalled()
  })

  const minimalDto = {
    title: 'Tomato Soup',
    category: 'soup',
    tags: [],
    image: 'https://assets.tugy.dev/tomato-soup.jpg',
    description: 'A soup',
    prepTime: 10,
    cookTime: 20,
    servings: 4,
    difficulty: 'easy',
    ingredients: [],
    steps: [],
  }

  it('findAll returns only ever-published, non-hidden recipes with no ratings or views attached', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ find })
    const result = await service.findAll()

    expect(find).toHaveBeenCalledWith({ hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(result).toEqual([{ slug: 'a', id: 'a', averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0, ownerName: null }])
  })

  it('findAll overlays the published-revision snapshot instead of live in-progress edits', async () => {
    const recipe = { slug: 'a', publishedRevision: 1, toObject: () => ({ slug: 'a', id: 'a', title: 'Live Draft Title' }) }
    const find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([recipe]) })
    const revisionModel = { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue({ snapshot: { title: 'Published Title' } }) }) }) }
    const service = await makeService({ find }, revisionModel)
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', title: 'Published Title' })
  })

  it('findAll attaches averageRating, ratingCount, and viewCount', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 4.5, count: 2 }])
    const service = await makeService({ find }, undefined, { aggregate }, makeActivityLog(new Map([['a', 42]])))
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', averageRating: 4.5, ratingCount: 2, viewCount: 42 })
  })

  it('findPublishedByOwner returns only that owner\'s ever-published, non-hidden recipes', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ find })
    const result = await service.findPublishedByOwner('user_1')

    expect(find).toHaveBeenCalledWith({ ownerId: 'user_1', hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(result).toEqual([{ slug: 'a', id: 'a', averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0, ownerName: null }])
  })

  it('findById returns the matching published recipe with ratings and views attached', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a' }) })
    const findOne = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 3, count: 1 }])
    const service = await makeService({ findOne }, undefined, { aggregate }, makeActivityLog(new Map([['a', 7]])))
    const result = await service.findById('a')

    expect(findOne).toHaveBeenCalledWith({ _id: 'a', hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(result).toEqual({ slug: 'a', id: 'a', averageRating: 3, ratingCount: 1, viewCount: 7, cookCount: 0, ownerName: null })
  })

  it('findById excludes hidden or never-published recipes', async () => {
    const exec = jest.fn().mockResolvedValue(null)
    const findOne = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ findOne })
    const result = await service.findById('hidden-one')

    expect(result).toBeNull()
  })

  it("findByIdForUser returns the owner's own draft even though it has never been published", async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a', status: 'draft', ownerId: 'user_1' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findByIdForUser('a', 'user_1', false)

    expect(result).toMatchObject({ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0 })
  })

  it('findByIdForUser returns null for a never-published draft belonging to someone else', async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findByIdForUser('a', 'user_2', false)

    expect(result).toBeNull()
  })

  it('findByIdForUser returns a never-published draft belonging to someone else when the requester is an admin', async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a', status: 'draft' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findByIdForUser('a', 'admin_1', true)

    expect(result).toMatchObject({ slug: 'a', status: 'draft' })
  })

  it("findByIdForUser shows the owner their own live in-progress edits on a published recipe, not the pinned snapshot", async () => {
    const recipe = { id: 'a', slug: 'a', status: 'published', ownerId: 'user_1', publishedRevision: 1, currentRevision: 2, toObject: () => ({ slug: 'a', id: 'a', title: 'Live Draft Title' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findByIdForUser('a', 'user_1', false)

    expect(result).toMatchObject({ slug: 'a', title: 'Live Draft Title' })
  })

  it('findByIdForUser shows a non-owner the pinned published snapshot, not the owner\'s in-progress edits', async () => {
    const recipe = { slug: 'a', status: 'published', ownerId: 'user_1', publishedRevision: 1, currentRevision: 2, toObject: () => ({ slug: 'a', id: 'a', title: 'Live Draft Title' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const revisionModel = { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue({ snapshot: { title: 'Published Title' } }) }) }) }
    const service = await makeService({ findOne }, revisionModel)
    const result = await service.findByIdForUser('a', 'user_2', false)

    expect(result).toMatchObject({ slug: 'a', title: 'Published Title' })
  })

  it('findMine returns the recipes owned by the given user, most recently updated first', async () => {
    const recipes = [{ slug: 'a', toObject: () => ({ slug: 'a', id: 'a' }) }]
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipes) })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })
    const result = await service.findMine('user_1')

    expect(find).toHaveBeenCalledWith({ ownerId: 'user_1', deletedAt: { $exists: false } })
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 })
    expect(result).toEqual([{ slug: 'a', id: 'a' }])
  })

  it('createDraft slugifies the title, stores the recipe as a revision-1 draft, and snapshots it', async () => {
    const exists = jest.fn().mockResolvedValue(null)
    const created = { id: 'tomato-soup', slug: 'tomato-soup', ...minimalDto, currentRevision: 1 }
    const create = jest.fn().mockResolvedValue(created)
    const revisionCreate = jest.fn().mockResolvedValue({})
    const service = await makeService({ exists, create }, { create: revisionCreate })
    await service.createDraft('user_1', minimalDto as any)

    expect(exists).toHaveBeenCalledWith({ slug: 'tomato-soup' })
    expect(create).toHaveBeenCalledWith({ ...minimalDto, slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', currentRevision: 1 })
    expect(revisionCreate).toHaveBeenCalledWith(expect.objectContaining({ recipeId: 'tomato-soup', revisionNumber: 1, authorId: 'user_1' }))
  })

  it('createDraft drops sources that repeat the same title as an earlier one, even with a different URL', async () => {
    // Search-grounded citations of the same source get their own unique
    // Vertex AI redirect URL per citation, so URL alone can't detect the
    // duplicate - title is the reliable signal here.
    const exists = jest.fn().mockResolvedValue(null)
    const dto = {
      ...minimalDto,
      sources: [
        { title: 'example.com', url: 'https://redirect.example/citation/1' },
        { title: 'example.com', url: 'https://redirect.example/citation/2' },
        { title: 'other.com', url: 'https://redirect.example/citation/3' },
      ],
    }
    const create = jest.fn().mockResolvedValue({ id: 'tomato-soup', slug: 'tomato-soup', ...dto, currentRevision: 1 })
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', dto as any)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sources: [
        { title: 'example.com', url: 'https://redirect.example/citation/1' },
        { title: 'other.com', url: 'https://redirect.example/citation/3' },
      ],
    }))
  })

  it('createDraft appends a numeric suffix when the slug is already taken', async () => {
    const exists = jest.fn().mockResolvedValueOnce({ _id: '1' }).mockResolvedValueOnce(null)
    const created = { slug: 'tomato-soup-2', ...minimalDto, currentRevision: 1 }
    const create = jest.fn().mockResolvedValue(created)
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', minimalDto as any)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'tomato-soup-2' }))
  })

  it('createDraft logs a recipe_created event', async () => {
    const exists = jest.fn().mockResolvedValue(false)
    const create = jest.fn().mockResolvedValue({ id: 'new-recipe', title: 'Tomato Soup' })
    const activityLog = makeActivityLog()
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) }, undefined, activityLog)
    await service.createDraft('user_1', { title: 'Tomato Soup' } as any)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'new-recipe', 'recipe_created')
  })

  it('updateDraft atomically increments the revision counter and saves a new snapshot', async () => {
    const existing = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { id: 'tomato-soup', slug: 'tomato-soup', currentRevision: 2, ...minimalDto }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const revisionCreate = jest.fn().mockResolvedValue({})
    const service = await makeService({ findOne, findOneAndUpdate }, { create: revisionCreate })
    const result = await service.updateDraft('tomato-soup', 'user_1', false, minimalDto as any)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tomato-soup' },
      { $set: minimalDto, $inc: { currentRevision: 1 } },
      { new: true },
    )
    expect(revisionCreate).toHaveBeenCalledWith(expect.objectContaining({ recipeId: 'tomato-soup', revisionNumber: 2, authorId: 'user_1' }))
    expect(result).toBe(updated)
  })

  it('updateDraft resets a rejected recipe back to draft and clears the review comment', async () => {
    const existing = { slug: 'a', ownerId: 'user_1', status: 'rejected' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { slug: 'a', status: 'draft', currentRevision: 2 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) })
    await service.updateDraft('a', 'user_1', false, minimalDto as any)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'a' },
      {
        $set: { ...minimalDto, status: 'draft' },
        $inc: { currentRevision: 1 },
        $unset: { reviewComment: '' },
      },
      { new: true },
    )
  })

  it('updateDraft is allowed on an already-published recipe (creates a new draft revision without touching what is live)', async () => {
    const existing = { slug: 'a', ownerId: 'user_1', status: 'published' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { slug: 'a', publishedRevision: 1, currentRevision: 2 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) })
    const result = await service.updateDraft('a', 'user_1', false, minimalDto as any)

    expect(result.currentRevision).toBe(2)
    expect(result.publishedRevision).toBe(1)
  })

  it('updateDraft ignores attempts to edit aiGenerated or sources once a recipe is AI-generated', async () => {
    const existing = { slug: 'a', ownerId: 'user_1', status: 'draft', aiGenerated: true, sources: [{ title: 'Original', url: 'https://example.com' }] }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { slug: 'a', currentRevision: 2 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) })
    const tamperedDto = { ...minimalDto, aiGenerated: false, sources: [{ title: 'Fake', url: 'https://evil.example' }] }
    await service.updateDraft('a', 'user_1', false, tamperedDto as any)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'a' },
      {
        $set: { ...tamperedDto, aiGenerated: true, sources: existing.sources },
        $inc: { currentRevision: 1 },
      },
      { new: true },
    )
  })

  it('updateDraft throws NotFoundException when the recipe does not exist', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findOne })
    await expect(service.updateDraft('missing', 'user_1', false, minimalDto as any)).rejects.toThrow(NotFoundException)
  })

  it('updateDraft looks up the recipe excluding soft-deleted ones', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findOne })
    await expect(service.updateDraft('a', 'user_1', false, minimalDto as any)).rejects.toThrow(NotFoundException)
    expect(findOne).toHaveBeenCalledWith({ _id: 'a', deletedAt: { $exists: false } })
  })

  it('findByIdForUser looks up the recipe excluding soft-deleted ones', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findOne })
    await service.findByIdForUser('a', 'user_1', false)
    expect(findOne).toHaveBeenCalledWith({ _id: 'a', deletedAt: { $exists: false } })
  })

  it('updateDraft throws ForbiddenException when a non-owner, non-admin tries to edit', async () => {
    const recipe = { slug: 'a', ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await expect(service.updateDraft('a', 'user_2', false, minimalDto as any)).rejects.toThrow(ForbiddenException)
  })

  it('updateDraft throws BadRequestException when the recipe is pending review', async () => {
    const recipe = { slug: 'a', ownerId: 'user_1', status: 'pending_review' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await expect(service.updateDraft('a', 'user_1', false, minimalDto as any)).rejects.toThrow(BadRequestException)
  })

  it('updateDraft logs a recipe_updated event', async () => {
    const existing = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { id: 'tomato-soup', slug: 'tomato-soup', currentRevision: 2 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) }, undefined, activityLog)
    await service.updateDraft('tomato-soup', 'user_1', false, minimalDto as any)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'tomato-soup', 'recipe_updated')
  })

  it('updateImage sets just the image field, without bumping the revision or writing a new revision snapshot', async () => {
    const existing = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { slug: 'tomato-soup', image: 'https://r2.example.com/new.jpg', currentRevision: 1 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const revisionCreate = jest.fn()
    const service = await makeService({ findOne, findOneAndUpdate }, { create: revisionCreate })
    const result = await service.updateImage('tomato-soup', 'user_1', false, 'https://r2.example.com/new.jpg')

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tomato-soup' },
      { $set: { image: 'https://r2.example.com/new.jpg' } },
      { new: true },
    )
    expect(revisionCreate).not.toHaveBeenCalled()
    expect(result).toBe(updated)
  })

  it('updateImage throws ForbiddenException when a non-owner, non-admin tries to change the photo', async () => {
    const recipe = { slug: 'a', ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await expect(service.updateImage('a', 'user_2', false, 'https://r2.example.com/x.jpg')).rejects.toThrow(ForbiddenException)
  })

  it('updateImage throws NotFoundException when the recipe does not exist', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findOne })
    await expect(service.updateImage('missing', 'user_1', false, 'https://r2.example.com/x.jpg')).rejects.toThrow(NotFoundException)
  })

  function completeRecipe(overrides: Record<string, unknown> = {}) {
    return {
      ...minimalDto,
      ingredients: [{ group: 'Main', items: [{ name: 'Tomato', amount: 1, unit: 'kg' }] }],
      steps: [{ group: 'Main', items: [{ instruction: 'Cook it' }] }],
      ownerId: 'user_1',
      status: 'draft',
      currentRevision: 3,
      reviewComment: 'old',
      save: jest.fn().mockResolvedValue(undefined),
      toObject: function (this: Record<string, unknown>) { return this },
      ...overrides,
    }
  }

  it('submitForReview publishes immediately when the AI review score meets the threshold', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 95, checkedAt: '2026-08-09T00:00:00.000Z', findings: [] })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)

    const result = await service.submitForReview('a', 'user_1', false)

    expect(updateOne).toHaveBeenCalledWith({ recipeId: 'a', revisionNumber: 3 }, { $set: { published: true } })
    expect(recipe.status).toBe('published')
    expect(recipe.publishedRevision).toBe(3)
    expect(recipe.reviewComment).toBeUndefined()
    expect(recipe.qualityReview).toEqual({ score: 95, checkedAt: '2026-08-09T00:00:00.000Z', findings: [] })
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
  })

  it('submitForReview rejects when the AI review score is below the threshold', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const review = { score: 94, checkedAt: '2026-08-09T00:00:00.000Z', findings: [{ category: 'image', severity: 'major', message: 'blurry' }] }
    const quality = makeQualityService(review)
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)

    await service.submitForReview('a', 'user_1', false)

    expect(updateOne).not.toHaveBeenCalled()
    expect(recipe.status).toBe('rejected')
    expect(recipe.publishedRevision).toBeUndefined()
    expect(recipe.qualityReview).toEqual(review)
  })

  it('submitForReview throws BadRequestException listing missing required fields, without calling the AI', async () => {
    const recipe = { title: 'Tomato Soup', ownerId: 'user_1', status: 'draft', save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const quality = makeQualityService()
    const service = await makeService({ findOne }, undefined, undefined, undefined, undefined, undefined, undefined, quality)

    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(BadRequestException)
    expect(recipe.save).not.toHaveBeenCalled()
    expect(quality.review).not.toHaveBeenCalled()
  })

  it('submitForReview flags ingredient items missing a name', async () => {
    const recipe: any = completeRecipe({ ingredients: [{ group: 'Main', items: [{ name: '', amount: 1, unit: 'kg' }] }] })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(/every item needs a name/)
  })

  it('submitForReview does not require a unit on ingredient items (optional for countable items like "1 clove")', async () => {
    const recipe: any = completeRecipe({ ingredients: [{ group: 'Main', items: [{ name: 'Garlic clove', amount: 1, unit: '' }] }] })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const service = await makeService({ findOne }, { updateOne })

    await expect(service.submitForReview('a', 'user_1', false)).resolves.toBe(recipe)
  })

  it('submitForReview flags a step section with no non-empty instruction', async () => {
    const recipe: any = completeRecipe({ steps: [{ group: 'Main', items: [{ instruction: '  ' }] }] })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(/every section needs at least one instruction/)
  })

  it('submitForReview logs submitted, AI-quality-review-used, and published events on a passing score', async () => {
    const recipe = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, { updateOne }, undefined, activityLog, undefined, undefined, undefined, quality)
    await service.submitForReview('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_submitted_for_review')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'ai_quality_review_used')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_published')
  })

  it('submitForReview logs a recipe_rejected event with the score on a failing score', async () => {
    const recipe = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const quality = makeQualityService({ score: 40, checkedAt: 'now', findings: [{ category: 'x', severity: 'critical', message: 'bad' }] })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, undefined, undefined, activityLog, undefined, undefined, undefined, quality)
    await service.submitForReview('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_rejected', { score: 40 })
  })

  it('listRecentSubmissions returns recipes with a qualityReview, most recently checked first', async () => {
    const recipes = [{ slug: 'a', toObject: () => ({ slug: 'a', id: 'a' }) }]
    const limit = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipes) })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })
    const result = await service.listRecentSubmissions()

    expect(find).toHaveBeenCalledWith({ qualityReview: { $exists: true } })
    expect(sort).toHaveBeenCalledWith({ 'qualityReview.checkedAt': -1 })
    expect(limit).toHaveBeenCalledWith(50)
    expect(result).toEqual([{ slug: 'a', id: 'a' }])
  })

  it('canViewDraftRevisions is true for an admin regardless of ownership', async () => {
    const service = await makeService({})
    await expect(service.canViewDraftRevisions('a', 'anyone', true)).resolves.toBe(true)
  })

  it("canViewDraftRevisions is true for the recipe's owner", async () => {
    const lean = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ ownerId: 'user_1' }) })
    const select = jest.fn().mockReturnValue({ lean })
    const findOne = jest.fn().mockReturnValue({ select })
    const service = await makeService({ findOne })
    await expect(service.canViewDraftRevisions('a', 'user_1', false)).resolves.toBe(true)
  })

  it('canViewDraftRevisions is false for anyone else', async () => {
    const lean = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ ownerId: 'user_1' }) })
    const select = jest.fn().mockReturnValue({ lean })
    const findOne = jest.fn().mockReturnValue({ select })
    const service = await makeService({ findOne })
    await expect(service.canViewDraftRevisions('a', 'user_2', false)).resolves.toBe(false)
  })

  it('listRevisions returns every revision, newest first, when includeDrafts is true', async () => {
    const revisions = [{ _id: 'rev-2', revisionNumber: 2, authorId: 'admin_1', snapshot: {}, published: false, createdAt: new Date('2026-01-02') }]
    const exec = jest.fn().mockResolvedValue(revisions)
    const lean = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({}, { find })
    const result = await service.listRevisions('a', true)

    expect(find).toHaveBeenCalledWith({ recipeId: 'a' })
    expect(sort).toHaveBeenCalledWith({ revisionNumber: -1 })
    expect(result).toEqual([{ id: 'rev-2', revisionNumber: 2, authorId: 'admin_1', snapshot: {}, published: false, publishedAt: new Date('2026-01-02') }])
  })

  it('listRevisions only returns published revisions when includeDrafts is false', async () => {
    const find = jest.fn().mockReturnValue({ sort: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue([]) }) }) })
    const service = await makeService({}, { find })
    await service.listRevisions('a', false)

    expect(find).toHaveBeenCalledWith({ recipeId: 'a', published: true })
  })

  it('remove soft-deletes a never-published recipe when the requester is its owner', async () => {
    const recipe: { status: string; ownerId: string; publishedRevision: undefined; save: jest.Mock; deletedAt?: Date } =
      { status: 'draft', ownerId: 'user_1', publishedRevision: undefined, save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn()
    const service = await makeService({ findOne, deleteOne })
    await service.remove('tomato-soup', 'user_1', false)

    expect(deleteOne).not.toHaveBeenCalled()
    expect(recipe.save).toHaveBeenCalled()
    expect(recipe.deletedAt).toBeInstanceOf(Date)
  })

  it('remove throws ForbiddenException for an ever-published recipe regardless of admin status, and never deletes it', async () => {
    const recipe = { status: 'rejected', ownerId: 'user_1', publishedRevision: 1, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn()
    const service = await makeService({ findOne, deleteOne })

    await expect(service.remove('tomato-soup', 'user_1', false)).rejects.toThrow(ForbiddenException)
    await expect(service.remove('tomato-soup', 'admin_1', true)).rejects.toThrow(ForbiddenException)
    expect(deleteOne).not.toHaveBeenCalled()
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('remove throws BadRequestException when the recipe is pending review', async () => {
    const recipe = { status: 'pending_review', ownerId: 'user_1', publishedRevision: undefined, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.remove('tomato-soup', 'user_1', false)).rejects.toThrow(BadRequestException)
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('remove throws ForbiddenException when a non-owner, non-admin tries to soft-delete a draft', async () => {
    const recipe = { status: 'draft', ownerId: 'user_1', publishedRevision: undefined, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.remove('tomato-soup', 'user_2', false)).rejects.toThrow(ForbiddenException)
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('remove logs a recipe_deleted event with a title/ownerId snapshot before soft-deleting', async () => {
    const recipe = { id: 'a', title: 'Tomato Soup', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, undefined, undefined, activityLog)
    await service.remove('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_deleted', { title: 'Tomato Soup', ownerId: 'user_1' })
  })
})
