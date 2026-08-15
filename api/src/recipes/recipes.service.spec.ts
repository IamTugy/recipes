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
import { RecipeSimilarityService } from './similarity/recipe-similarity.service'
import { RecipeGroupingService } from './grouping/recipe-grouping.service'

describe('RecipesService', () => {
  function makeActivityLog(viewCounts: Map<string, number> = new Map()) {
    return { viewCountsById: jest.fn().mockResolvedValue(viewCounts), record: jest.fn().mockResolvedValue(undefined) }
  }

  function makeCookLog(cookCounts: Map<string, number> = new Map(), userCookCounts: Map<string, number> = new Map()) {
    return { countsById: jest.fn().mockResolvedValue(cookCounts), userCountsById: jest.fn().mockResolvedValue(userCookCounts) }
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

  function makeSimilarityService(candidates: unknown[] = [], verdict: Record<string, unknown> = { isDuplicate: false, reason: 'not a duplicate' }) {
    return { findCandidates: jest.fn().mockResolvedValue(candidates), judge: jest.fn().mockResolvedValue(verdict) }
  }

  function makeGroupingService(group: Record<string, unknown> = { id: 'group-1', name: 'Test Dish', nameHe: undefined }) {
    return { assignGroup: jest.fn().mockResolvedValue(group) }
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
    similarityService = makeSimilarityService(),
    groupingService = makeGroupingService(),
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
        { provide: RecipeSimilarityService, useValue: similarityService },
        { provide: RecipeGroupingService, useValue: groupingService },
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

  it('findPublishedByOwners returns [] without querying when given no owner ids', async () => {
    const find = jest.fn()
    const service = await makeService({ find })
    const result = await service.findPublishedByOwners([])

    expect(find).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('findPublishedByOwners returns published, non-hidden recipes from the given owners, most recent first', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a', id: 'a' }) }])
    const limit = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })
    const result = await service.findPublishedByOwners(['user_1', 'user_2'])

    expect(find).toHaveBeenCalledWith({ ownerId: { $in: ['user_1', 'user_2'] }, hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(limit).toHaveBeenCalledWith(100)
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

  it('findPending returns the caller\'s pending-review recipes ordered by batch then creation time', async () => {
    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ toObject: () => ({ id: 'a', title: 'Soup', pendingReview: true }) }]),
    })
    const service = await makeService({ find })
    const result = await service.findPending('user_1')

    expect(find).toHaveBeenCalledWith({ ownerId: 'user_1', pendingReview: true, deletedAt: { $exists: false } })
    expect(result).toEqual([{ id: 'a', title: 'Soup', pendingReview: true }])
  })

  it('createDraft slugifies the title, stores the recipe as a revision-1 draft, and snapshots it', async () => {
    const exists = jest.fn().mockResolvedValue(null)
    const created = { id: 'tomato-soup', slug: 'tomato-soup', ...minimalDto, currentRevision: 1 }
    const create = jest.fn().mockResolvedValue(created)
    const revisionCreate = jest.fn().mockResolvedValue({})
    const service = await makeService({ exists, create }, { create: revisionCreate })
    await service.createDraft('user_1', minimalDto as any)

    expect(exists).toHaveBeenCalledWith({ slug: 'tomato-soup' })
    expect(create).toHaveBeenCalledWith({ ...minimalDto, sources: undefined, slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', currentRevision: 1, pendingReview: false, batchId: undefined })
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

  it('createDraft rejects a linkedRecipeId that does not resolve to a real recipe', async () => {
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService({ find })
    const dto = { title: 'Cake', ingredients: [{ group: '', items: [{ linkedRecipeId: 'missing-recipe' }] }] }
    await expect(service.createDraft('user_1', dto as any)).rejects.toThrow(BadRequestException)
  })

  it('createDraft allows a linkedRecipeId that resolves to a real recipe', async () => {
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'dough-recipe' }]) })
    const exists = jest.fn().mockResolvedValue(false)
    const create = jest.fn().mockResolvedValue({ id: 'cake', title: 'Cake' })
    const service = await makeService({ find, exists, create }, { create: jest.fn().mockResolvedValue({}) })
    const dto = { title: 'Cake', ingredients: [{ group: '', items: [{ linkedRecipeId: 'dough-recipe' }] }] }
    await expect(service.createDraft('user_1', dto as any)).resolves.toBeDefined()
  })

  it('updateDraft rejects a direct circular link (A links to B, saving B to link back to A)', async () => {
    const existing = { slug: 'b', ownerId: 'user_1', status: 'draft' }
    // findOne is called twice: once by getEditableOrThrow (plain .exec()),
    // once by linkedIdsOf('recipe-a') during the cycle walk (.select().lean().exec()).
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(existing) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: [{ items: [{ linkedRecipeId: 'b' }] }] }) })
    // find is called once, by assertLinksResolve, to confirm 'recipe-a' exists.
    const find = jest.fn()
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'recipe-a' }]) })
    const service = await makeService({ findOne, find })
    const dto = { title: 'B', ingredients: [{ group: '', items: [{ linkedRecipeId: 'recipe-a' }] }] }
    await expect(service.updateDraft('b', 'user_1', false, dto as any)).rejects.toThrow(BadRequestException)
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
      { $set: { ...minimalDto, sources: undefined, pendingReview: false }, $inc: { currentRevision: 1 } },
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
        $set: { ...minimalDto, sources: undefined, pendingReview: false, status: 'draft', disputeStatus: 'none' },
        $inc: { currentRevision: 1 },
        $unset: { reviewComment: '', duplicateReview: '' },
      },
      { new: true },
    )
  })

  it('updateDraft clears a lingering duplicate dispute when a rejected recipe is edited', async () => {
    const existing = {
      slug: 'a', ownerId: 'user_1', status: 'rejected',
      disputeStatus: 'pending',
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
    }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { slug: 'a', status: 'draft', currentRevision: 2 }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) })
    await service.updateDraft('a', 'user_1', false, minimalDto as any)

    const [, update] = findOneAndUpdate.mock.calls[0]
    expect((update.$set as Record<string, unknown>).disputeStatus).toBe('none')
    expect((update.$unset as Record<string, unknown>).duplicateReview).toBe('')
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
        $set: { ...tamperedDto, aiGenerated: true, sources: existing.sources, pendingReview: false },
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

  it('createDraft sets pendingReview and batchId when opts are provided', async () => {
    const exists = jest.fn().mockResolvedValue(false)
    const create = jest.fn().mockResolvedValue({ id: 'new-recipe', title: 'Soup' })
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', { title: 'Soup' } as any, { pendingReview: true, batchId: 'batch-1' })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ pendingReview: true, batchId: 'batch-1' }))
  })

  it('createDraft defaults pendingReview to false when opts are omitted', async () => {
    const exists = jest.fn().mockResolvedValue(false)
    const create = jest.fn().mockResolvedValue({ id: 'new-recipe', title: 'Soup' })
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', { title: 'Soup' } as any)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ pendingReview: false, batchId: undefined }))
  })

  it('updateDraft clears pendingReview on every save', async () => {
    const existing = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', pendingReview: true }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { id: 'tomato-soup', slug: 'tomato-soup', currentRevision: 2, pendingReview: false }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) })
    await service.updateDraft('tomato-soup', 'user_1', false, { title: 'Tomato Soup' } as any)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tomato-soup' },
      expect.objectContaining({ $set: expect.objectContaining({ pendingReview: false }) }),
      { new: true },
    )
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
      disputeStatus: 'none',
      duplicateCheckOverride: false,
      save: jest.fn().mockResolvedValue(undefined),
      toObject: function (this: Record<string, unknown>) { return this },
      ...overrides,
    }
  }

  it('submitForReview publishes immediately when the AI review score meets the threshold', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
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

  it('submitForReview assigns a dish group when it publishes', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 95, checkedAt: 'now', findings: [] })
    const grouping = makeGroupingService({ id: 'group-1', name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, undefined, grouping)

    await service.submitForReview('a', 'user_1', false)

    expect(grouping.assignGroup).toHaveBeenCalledWith(recipe)
    expect(recipe.dishGroupId).toBe('group-1')
    expect(recipe.dishGroupName).toBe('Caprese Salad')
    expect(recipe.dishGroupNameHe).toBe('סלט קפרזה')
  })

  it('submitForReview does not assign a dish group when the score is below the threshold', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const quality = makeQualityService({ score: 40, checkedAt: 'now', findings: [] })
    const grouping = makeGroupingService()
    const service = await makeService({ findOne }, undefined, undefined, undefined, undefined, undefined, undefined, quality, undefined, grouping)

    await service.submitForReview('a', 'user_1', false)

    expect(grouping.assignGroup).not.toHaveBeenCalled()
    expect(recipe.dishGroupId).toBeUndefined()
  })

  it('submitForReview rejects when the AI review score is below the threshold', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
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

  it('submitForReview does not call the duplicate judge when there are no candidates', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const similarity = makeSimilarityService([])
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(similarity.findCandidates).toHaveBeenCalledWith(recipe, 'a')
    expect(similarity.judge).not.toHaveBeenCalled()
    expect(recipe.status).toBe('published')
  })

  it('submitForReview clears a stale duplicateReview from an earlier blocked submission when this resubmission is not a duplicate', async () => {
    const recipe: any = completeRecipe({
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other Soup', reason: 'same dish, rescaled', checkedAt: 'earlier' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const similarity = makeSimilarityService([])
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(recipe.duplicateReview).toBeUndefined()
  })

  it('submitForReview rejects and skips the quality review when the AI judges a duplicate', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const quality = makeQualityService()
    const candidates = [{ id: 'other-1', title: 'Other Soup', titleHe: undefined, ingredients: [], steps: [] }]
    const similarity = makeSimilarityService(candidates, { isDuplicate: true, matchedRecipeId: 'other-1', reason: 'same dish, rescaled' })
    const service = await makeService({ findOne }, undefined, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    const result = await service.submitForReview('a', 'user_1', false)

    expect(quality.review).not.toHaveBeenCalled()
    expect(recipe.status).toBe('rejected')
    expect(recipe.qualityReview).toBeUndefined()
    expect(recipe.duplicateReview).toMatchObject({
      isDuplicate: true,
      matchedRecipeId: 'other-1',
      matchedRecipeTitle: 'Other Soup',
      reason: 'same dish, rescaled',
    })
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
  })

  it('submitForReview proceeds to the quality review instead of blocking when the AI hallucinates a matchedRecipeId outside the candidate list', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const candidates = [{ id: 'other-1', title: 'Other Soup', titleHe: undefined, ingredients: [], steps: [] }]
    // Gemini claims a duplicate match against an id that was never in the candidate list it was given.
    const similarity = makeSimilarityService(candidates, { isDuplicate: true, matchedRecipeId: 'not-a-real-candidate', reason: 'hallucinated match' })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    const result = await service.submitForReview('a', 'user_1', false)

    expect(quality.review).toHaveBeenCalled()
    expect(recipe.status).toBe('published')
    expect(recipe.duplicateReview).toBeUndefined()
    expect(result).toBe(recipe)
  })

  it('submitForReview proceeds to the quality review when the AI judges no duplicate among candidates', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const candidates = [{ id: 'other-1', title: 'Other Soup', titleHe: undefined, ingredients: [], steps: [] }]
    const similarity = makeSimilarityService(candidates, { isDuplicate: false, reason: 'different dish' })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(quality.review).toHaveBeenCalled()
    expect(recipe.status).toBe('published')
  })

  it('submitForReview skips the duplicate check entirely when duplicateCheckOverride is set', async () => {
    const recipe: any = completeRecipe({ duplicateCheckOverride: true })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const similarity = makeSimilarityService()
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(similarity.findCandidates).not.toHaveBeenCalled()
    expect(quality.review).toHaveBeenCalled()
    expect(recipe.status).toBe('published')
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
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const service = await makeService({ findOne }, { updateOne })

    await expect(service.submitForReview('a', 'user_1', false)).resolves.toBe(recipe)
  })

  it('submitForReview treats a linked ingredient (no name) as complete', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'other-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(recipe) }) // getEditableOrThrow
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: recipe.ingredients }) }) // linkedIdsOf(recipe.id)
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: [] }) }) // linkedIdsOf('other-recipe') during the BFS walk
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'other-recipe', publishedRevision: 1, title: 'Other' }]) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const service = await makeService({ findOne, find }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)

    // Should reach the quality-review step rather than throwing "missing/invalid: ingredients"
    await expect(service.submitForReview('a', 'user_1', false)).resolves.toBeDefined()
  })

  it('submitForReview throws BadRequestException when a directly linked recipe is not published', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'dough-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(recipe) }) // getEditableOrThrow
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: recipe.ingredients }) }) // linkedIdsOf(recipe.id)
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: [] }) }) // linkedIdsOf('dough-recipe') during the BFS walk
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'dough-recipe', publishedRevision: null, title: 'Dough' }]) })
    const service = await makeService({ findOne, find })
    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('submitForReview clears pendingReview when it publishes successfully', async () => {
    const recipe: any = completeRecipe({ pendingReview: true })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)

    await service.submitForReview('a', 'user_1', false)

    expect(recipe.status).toBe('published')
    expect(recipe.pendingReview).toBe(false)
  })

  it('submitForReview rejects when a linked recipe id does not resolve to any recipe at all', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'ghost-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(recipe) }) // getEditableOrThrow
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: recipe.ingredients }) }) // linkedIdsOf(recipe.id)
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) }) // linkedIdsOf('ghost-recipe') during the BFS walk - recipe not found
    // 'ghost-recipe' resolves to nothing at all, not to a document with publishedRevision: null
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService({ findOne, find })

    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(/ghost-recipe/)
  })

  it('submitForReview allows publishing when every linked recipe is already published', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'dough-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(recipe) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: recipe.ingredients }) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: [] }) }) // linkedIdsOf('dough-recipe') during the BFS walk
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'dough-recipe', publishedRevision: 1, title: 'Dough' }]) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const service = await makeService({ findOne, find }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)
    await expect(service.submitForReview('a', 'user_1', false)).resolves.toBeDefined()
  })

  it('submitForReview flags a step section with no non-empty instruction', async () => {
    const recipe: any = completeRecipe({ steps: [{ group: 'Main', items: [{ instruction: '  ' }] }] })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(/every section needs at least one instruction/)
  })

  it('submitForReview logs submitted, AI-quality-review-used, and published events on a passing score', async () => {
    const recipe = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
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
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const quality = makeQualityService({ score: 40, checkedAt: 'now', findings: [{ category: 'x', severity: 'critical', message: 'bad' }] })
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne }, undefined, undefined, activityLog, undefined, undefined, undefined, quality)
    await service.submitForReview('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_rejected', { score: 40 })
  })

  it('disputeDuplicate sets disputeStatus to pending on a duplicate-blocked recipe', async () => {
    const recipe: any = completeRecipe({ duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' } })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    const result = await service.disputeDuplicate('a', 'user_1', false, 'I made this myself')

    expect(recipe.disputeStatus).toBe('pending')
    expect(recipe.disputeMessage).toBe('I made this myself')
    expect(recipe.disputeCreatedAt).toBeInstanceOf(Date)
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
  })

  it('disputeDuplicate throws when the recipe was not blocked as a duplicate', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.disputeDuplicate('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('disputeDuplicate throws when already disputed', async () => {
    const recipe: any = completeRecipe({
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.disputeDuplicate('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('listDuplicateDisputes queries recipes with a pending dispute', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ _id: 'a' }]) })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    const result = await service.listDuplicateDisputes()

    expect(find).toHaveBeenCalledWith({ disputeStatus: 'pending', deletedAt: { $exists: false } })
    expect(result).toEqual([{ _id: 'a' }])
  })

  it('resolveDuplicateDispute approving sets duplicateCheckOverride and resets status to draft', async () => {
    const recipe: any = completeRecipe({
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    const result = await service.resolveDuplicateDispute('a', true)

    expect(recipe.disputeStatus).toBe('approved')
    expect(recipe.duplicateCheckOverride).toBe(true)
    expect(recipe.status).toBe('draft')
    expect(recipe.disputeResolvedAt).toBeInstanceOf(Date)
    expect(result).toBe(recipe)
  })

  it('resolveDuplicateDispute denying leaves the recipe rejected', async () => {
    const recipe: any = completeRecipe({
      status: 'rejected',
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await service.resolveDuplicateDispute('a', false)

    expect(recipe.disputeStatus).toBe('denied')
    expect(recipe.duplicateCheckOverride).toBe(false)
    expect(recipe.status).toBe('rejected')
  })

  it('resolveDuplicateDispute throws when there is no pending dispute', async () => {
    const recipe: any = completeRecipe({ disputeStatus: 'none' })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.resolveDuplicateDispute('a', true)).rejects.toThrow(BadRequestException)
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
    const exists = jest.fn().mockResolvedValue(false)
    const deleteOne = jest.fn()
    const service = await makeService({ findOne, exists, deleteOne })
    await service.remove('tomato-soup', 'user_1', false)

    expect(deleteOne).not.toHaveBeenCalled()
    expect(recipe.save).toHaveBeenCalled()
    expect(recipe.deletedAt).toBeInstanceOf(Date)
  })

  it('remove throws ForbiddenException for an ever-published recipe regardless of admin status, and never deletes it', async () => {
    const recipe = { status: 'rejected', ownerId: 'user_1', publishedRevision: 1, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(false)
    const deleteOne = jest.fn()
    const service = await makeService({ findOne, exists, deleteOne })

    await expect(service.remove('tomato-soup', 'user_1', false)).rejects.toThrow(ForbiddenException)
    await expect(service.remove('tomato-soup', 'admin_1', true)).rejects.toThrow(ForbiddenException)
    expect(deleteOne).not.toHaveBeenCalled()
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('remove throws BadRequestException when the recipe is pending review', async () => {
    const recipe = { status: 'pending_review', ownerId: 'user_1', publishedRevision: undefined, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(false)
    const service = await makeService({ findOne, exists })

    await expect(service.remove('tomato-soup', 'user_1', false)).rejects.toThrow(BadRequestException)
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('remove throws ForbiddenException when a non-owner, non-admin tries to soft-delete a draft', async () => {
    const recipe = { status: 'draft', ownerId: 'user_1', publishedRevision: undefined, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(false)
    const service = await makeService({ findOne, exists })

    await expect(service.remove('tomato-soup', 'user_2', false)).rejects.toThrow(ForbiddenException)
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('remove logs a recipe_deleted event with a title/ownerId snapshot before soft-deleting', async () => {
    const recipe = { id: 'a', title: 'Tomato Soup', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(false)
    const activityLog = makeActivityLog()
    const service = await makeService({ findOne, exists }, undefined, undefined, activityLog)
    await service.remove('a', 'user_1', false)

    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_deleted', { title: 'Tomato Soup', ownerId: 'user_1' })
  })

  it('remove throws ForbiddenException when another recipe links to this one as an ingredient', async () => {
    const recipe = { id: 'dough-recipe', title: 'Dough', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(true)
    const service = await makeService({ findOne, exists })
    await expect(service.remove('dough-recipe', 'user_1', false)).rejects.toThrow(ForbiddenException)
    expect(exists).toHaveBeenCalledWith({ 'ingredients.items.linkedRecipeId': 'dough-recipe', deletedAt: { $exists: false } })
  })

  it('remove succeeds when no other recipe links to this one', async () => {
    const recipe = { id: 'a', title: 'Solo', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(false)
    const service = await makeService({ findOne, exists })
    await expect(service.remove('a', 'user_1', false)).resolves.toBeUndefined()
  })
})
