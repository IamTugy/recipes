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

describe('RecipesService', () => {
  function makeActivityLog(viewCounts: Map<string, number> = new Map()) {
    return { viewCountsBySlug: jest.fn().mockResolvedValue(viewCounts) }
  }

  function makeCookLog(cookCounts: Map<string, number> = new Map()) {
    return { countsBySlug: jest.fn().mockResolvedValue(cookCounts) }
  }

  function noUnownedRecipes(overrides: Record<string, unknown> = {}) {
    return { find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }), ...overrides }
  }

  function noRevisionFound() {
    return { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(null) }) }) }
  }

  async function makeService(
    recipeModel: Record<string, unknown>,
    revisionModel: Record<string, unknown> = noRevisionFound(),
    ratingModel: Record<string, unknown> = { aggregate: jest.fn().mockResolvedValue([]) },
    activityLog = makeActivityLog(),
    cookLog = makeCookLog(),
    config: Record<string, unknown> = { get: jest.fn().mockReturnValue('owner_1') },
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: getModelToken(RecipeRevision.name), useValue: revisionModel },
        { provide: getModelToken(Rating.name), useValue: ratingModel },
        { provide: ActivityLogService, useValue: activityLog },
        { provide: CookLogService, useValue: cookLog },
        { provide: ConfigService, useValue: config },
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
      { slug: 'rated-recipe', title: 'Rated Recipe' },
      { slug: 'other-recipe', title: 'Other Recipe' },
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
    expect(distinct).toHaveBeenCalledWith('recipeSlug', { userId: 'owner_1' })
    expect(updateMany).toHaveBeenCalledWith(
      { slug: { $in: ['rated-recipe', 'other-recipe'] } },
      { $set: { ownerId: 'owner_1' } },
    )
    expect(updateMany).toHaveBeenCalledWith(
      { slug: { $in: ['other-recipe'] } },
      { $set: { status: 'draft', currentRevision: 0 } },
    )
    expect(updateMany).toHaveBeenCalledWith(
      { slug: { $in: ['rated-recipe'] } },
      { $set: { status: 'published', currentRevision: 1, publishedRevision: 1 } },
    )
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      recipeSlug: 'rated-recipe', revisionNumber: 1, authorId: 'owner_1', published: true,
    }))
  })

  it('onModuleInit does not create a duplicate revision-1 snapshot when one already exists', async () => {
    const unowned = [{ slug: 'rated-recipe', title: 'Rated Recipe' }]
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
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ find })
    const result = await service.findAll()

    expect(find).toHaveBeenCalledWith({ hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(result).toEqual([{ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0 }])
  })

  it('findAll overlays the published-revision snapshot instead of live in-progress edits', async () => {
    const recipe = { slug: 'a', publishedRevision: 1, toObject: () => ({ slug: 'a', title: 'Live Draft Title' }) }
    const find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([recipe]) })
    const revisionModel = { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue({ snapshot: { title: 'Published Title' } }) }) }) }
    const service = await makeService({ find }, revisionModel)
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', title: 'Published Title' })
  })

  it('findAll attaches averageRating, ratingCount, and viewCount', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 4.5, count: 2 }])
    const service = await makeService({ find }, undefined, { aggregate }, makeActivityLog(new Map([['a', 42]])))
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', averageRating: 4.5, ratingCount: 2, viewCount: 42 })
  })

  it('findPublishedByOwner returns only that owner\'s ever-published, non-hidden recipes', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ find })
    const result = await service.findPublishedByOwner('user_1')

    expect(find).toHaveBeenCalledWith({ ownerId: 'user_1', hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(result).toEqual([{ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0 }])
  })

  it('findBySlug returns the matching published recipe with ratings and views attached', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'a', publishedRevision: undefined, toObject: () => ({ slug: 'a' }) })
    const findOne = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 3, count: 1 }])
    const service = await makeService({ findOne }, undefined, { aggregate }, makeActivityLog(new Map([['a', 7]])))
    const result = await service.findBySlug('a')

    expect(findOne).toHaveBeenCalledWith({ slug: 'a', hidden: { $ne: true }, publishedRevision: { $ne: null } })
    expect(result).toEqual({ slug: 'a', averageRating: 3, ratingCount: 1, viewCount: 7, cookCount: 0 })
  })

  it('findBySlug excludes hidden or never-published recipes', async () => {
    const exec = jest.fn().mockResolvedValue(null)
    const findOne = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ findOne })
    const result = await service.findBySlug('hidden-one')

    expect(result).toBeNull()
  })

  it("findBySlugForUser returns the owner's own draft even though it has never been published", async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', publishedRevision: undefined, toObject: () => ({ slug: 'a', status: 'draft', ownerId: 'user_1' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'user_1', false)

    expect(result).toMatchObject({ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0 })
  })

  it('findBySlugForUser returns null for a never-published draft belonging to someone else', async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', publishedRevision: undefined, toObject: () => ({ slug: 'a' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'user_2', false)

    expect(result).toBeNull()
  })

  it('findBySlugForUser returns a never-published draft belonging to someone else when the requester is an admin', async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', publishedRevision: undefined, toObject: () => ({ slug: 'a', status: 'draft' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'admin_1', true)

    expect(result).toMatchObject({ slug: 'a', status: 'draft' })
  })

  it("findBySlugForUser shows the owner their own live in-progress edits on a published recipe, not the pinned snapshot", async () => {
    const recipe = { slug: 'a', status: 'published', ownerId: 'user_1', publishedRevision: 1, currentRevision: 2, toObject: () => ({ slug: 'a', title: 'Live Draft Title' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'user_1', false)

    expect(result).toMatchObject({ slug: 'a', title: 'Live Draft Title' })
  })

  it('findBySlugForUser shows a non-owner the pinned published snapshot, not the owner\'s in-progress edits', async () => {
    const recipe = { slug: 'a', status: 'published', ownerId: 'user_1', publishedRevision: 1, currentRevision: 2, toObject: () => ({ slug: 'a', title: 'Live Draft Title' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const revisionModel = { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue({ snapshot: { title: 'Published Title' } }) }) }) }
    const service = await makeService({ findOne }, revisionModel)
    const result = await service.findBySlugForUser('a', 'user_2', false)

    expect(result).toMatchObject({ slug: 'a', title: 'Published Title' })
  })

  it('findMine returns the recipes owned by the given user, most recently updated first', async () => {
    const recipes = [{ slug: 'a', toObject: () => ({ slug: 'a' }) }]
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipes) })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })
    const result = await service.findMine('user_1')

    expect(find).toHaveBeenCalledWith({ ownerId: 'user_1' })
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 })
    expect(result).toEqual([{ slug: 'a' }])
  })

  it('createDraft slugifies the title, stores the recipe as a revision-1 draft, and snapshots it', async () => {
    const exists = jest.fn().mockResolvedValue(null)
    const created = { slug: 'tomato-soup', ...minimalDto, currentRevision: 1 }
    const create = jest.fn().mockResolvedValue(created)
    const revisionCreate = jest.fn().mockResolvedValue({})
    const service = await makeService({ exists, create }, { create: revisionCreate })
    await service.createDraft('user_1', minimalDto as any)

    expect(exists).toHaveBeenCalledWith({ slug: 'tomato-soup' })
    expect(create).toHaveBeenCalledWith({ ...minimalDto, slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', currentRevision: 1 })
    expect(revisionCreate).toHaveBeenCalledWith(expect.objectContaining({ recipeSlug: 'tomato-soup', revisionNumber: 1, authorId: 'user_1' }))
  })

  it('createDraft appends a numeric suffix when the slug is already taken', async () => {
    const exists = jest.fn().mockResolvedValueOnce({ _id: '1' }).mockResolvedValueOnce(null)
    const created = { slug: 'tomato-soup-2', ...minimalDto, currentRevision: 1 }
    const create = jest.fn().mockResolvedValue(created)
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', minimalDto as any)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'tomato-soup-2' }))
  })

  it('updateDraft sets the recipe fields, bumps the revision counter, and saves a new snapshot', async () => {
    const recipe: any = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', currentRevision: 1, set: jest.fn(), save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const revisionCreate = jest.fn().mockResolvedValue({})
    const service = await makeService({ findOne }, { create: revisionCreate })
    const result = await service.updateDraft('tomato-soup', 'user_1', false, minimalDto as any)

    expect(recipe.set).toHaveBeenCalledWith(minimalDto)
    expect(recipe.currentRevision).toBe(2)
    expect(recipe.save).toHaveBeenCalled()
    expect(revisionCreate).toHaveBeenCalledWith(expect.objectContaining({ recipeSlug: 'tomato-soup', revisionNumber: 2, authorId: 'user_1' }))
    expect(result).toBe(recipe)
  })

  it('updateDraft is allowed on an already-published recipe (creates a new draft revision without touching what is live)', async () => {
    const recipe: any = { slug: 'a', ownerId: 'user_1', status: 'published', publishedRevision: 1, currentRevision: 1, set: jest.fn(), save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne }, { create: jest.fn().mockResolvedValue({}) })
    await service.updateDraft('a', 'user_1', false, minimalDto as any)

    expect(recipe.currentRevision).toBe(2)
    expect(recipe.publishedRevision).toBe(1)
  })

  it('updateDraft throws NotFoundException when the recipe does not exist', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findOne })
    await expect(service.updateDraft('missing', 'user_1', false, minimalDto as any)).rejects.toThrow(NotFoundException)
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

  it('submitForReview moves a complete draft into pending_review', async () => {
    const recipe = {
      ...minimalDto,
      ingredients: [{ group: 'Main', items: [{ name: 'Tomato', amount: 1, unit: 'kg' }] }],
      steps: [{ group: 'Main', items: ['Cook it'] }],
      ownerId: 'user_1',
      status: 'draft',
      reviewComment: 'old',
      save: jest.fn().mockResolvedValue(undefined),
    }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.submitForReview('a', 'user_1', false)

    expect(recipe.status).toBe('pending_review')
    expect(recipe.reviewComment).toBeUndefined()
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
  })

  it('submitForReview throws BadRequestException listing missing required fields', async () => {
    const recipe = { title: 'Tomato Soup', ownerId: 'user_1', status: 'draft', save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(BadRequestException)
    expect(recipe.save).not.toHaveBeenCalled()
  })

  it('cancelSubmission moves a never-published recipe back to draft', async () => {
    const recipe: any = { ownerId: 'user_1', status: 'pending_review', publishedRevision: undefined, save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await service.cancelSubmission('a', 'user_1', false)

    expect(recipe.status).toBe('draft')
    expect(recipe.save).toHaveBeenCalled()
  })

  it('cancelSubmission restores a previously-published recipe to published, not draft', async () => {
    const recipe: any = { ownerId: 'user_1', status: 'pending_review', publishedRevision: 1, save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await service.cancelSubmission('a', 'user_1', false)

    expect(recipe.status).toBe('published')
  })

  it('cancelSubmission throws BadRequestException when the recipe is not pending review', async () => {
    const recipe = { ownerId: 'user_1', status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await expect(service.cancelSubmission('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('listPendingSubmissions returns pending_review recipes, oldest first', async () => {
    const recipes = [{ slug: 'a', toObject: () => ({ slug: 'a' }) }]
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipes) })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })
    const result = await service.listPendingSubmissions()

    expect(find).toHaveBeenCalledWith({ status: 'pending_review' })
    expect(sort).toHaveBeenCalledWith({ updatedAt: 1 })
    expect(result).toEqual([{ slug: 'a' }])
  })

  it('approveSubmission marks the current revision published and pins it as the live one', async () => {
    const recipe: any = { title: 'Tomato Soup', status: 'pending_review', currentRevision: 3, save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const service = await makeService({ findOne }, { updateOne })
    const result = await service.approveSubmission('a', 'admin_1')

    expect(updateOne).toHaveBeenCalledWith(
      { recipeSlug: 'a', revisionNumber: 3 },
      { $set: { published: true } },
    )
    expect(recipe.status).toBe('published')
    expect(recipe.publishedRevision).toBe(3)
    expect(result).toBe(recipe)
  })

  it('approveSubmission throws BadRequestException when the recipe is not pending review', async () => {
    const recipe = { status: 'draft' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await expect(service.approveSubmission('a', 'admin_1')).rejects.toThrow(BadRequestException)
  })

  it('rejectSubmission sets the recipe back to rejected with the given comment', async () => {
    const recipe: any = { status: 'pending_review', save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await service.rejectSubmission('a', 'Please add a better photo')

    expect(recipe.status).toBe('rejected')
    expect(recipe.reviewComment).toBe('Please add a better photo')
    expect(recipe.save).toHaveBeenCalled()
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
    const revisions = [{ revisionNumber: 2, authorId: 'admin_1', snapshot: {}, published: false, createdAt: new Date('2026-01-02') }]
    const exec = jest.fn().mockResolvedValue(revisions)
    const lean = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({}, { find })
    const result = await service.listRevisions('a', true)

    expect(find).toHaveBeenCalledWith({ recipeSlug: 'a' })
    expect(sort).toHaveBeenCalledWith({ revisionNumber: -1 })
    expect(result).toEqual([{ revisionNumber: 2, authorId: 'admin_1', snapshot: {}, published: false, publishedAt: new Date('2026-01-02') }])
  })

  it('listRevisions only returns published revisions when includeDrafts is false', async () => {
    const find = jest.fn().mockReturnValue({ sort: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue([]) }) }) })
    const service = await makeService({}, { find })
    await service.listRevisions('a', false)

    expect(find).toHaveBeenCalledWith({ recipeSlug: 'a', published: true })
  })

  it('remove deletes a never-published recipe when the requester is its owner', async () => {
    const recipe = { status: 'draft', ownerId: 'user_1', publishedRevision: undefined }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ findOne, deleteOne })
    await service.remove('tomato-soup', 'user_1', false)

    expect(deleteOne).toHaveBeenCalledWith({ slug: 'tomato-soup' })
  })

  it('remove throws ForbiddenException when a non-admin tries to delete an ever-published recipe, even if currently rejected', async () => {
    const recipe = { status: 'rejected', ownerId: 'user_1', publishedRevision: 1 }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn()
    const service = await makeService({ findOne, deleteOne })
    await expect(service.remove('tomato-soup', 'user_1', false)).rejects.toThrow(ForbiddenException)
    expect(deleteOne).not.toHaveBeenCalled()
  })

  it('remove allows an admin to delete an ever-published recipe', async () => {
    const recipe = { status: 'published', ownerId: 'user_1', publishedRevision: 1 }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ findOne, deleteOne })
    await service.remove('tomato-soup', 'admin_1', true)

    expect(deleteOne).toHaveBeenCalledWith({ slug: 'tomato-soup' })
  })
})
