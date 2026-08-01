import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
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

  async function makeService(
    recipeModel: Record<string, unknown>,
    revisionModel: Record<string, unknown> = {},
    ratingModel: Record<string, unknown> = { aggregate: jest.fn().mockResolvedValue([]) },
    activityLog = makeActivityLog(),
    cookLog = makeCookLog(),
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: getModelToken(RecipeRevision.name), useValue: revisionModel },
        { provide: getModelToken(Rating.name), useValue: ratingModel },
        { provide: ActivityLogService, useValue: activityLog },
        { provide: CookLogService, useValue: cookLog },
      ],
    }).compile()
    return moduleRef.get(RecipesService)
  }

  it('onModuleInit backfills status=published on recipes stored before that field existed', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 })
    const service = await makeService({ updateMany })
    await service.onModuleInit()

    expect(updateMany).toHaveBeenCalledWith(
      { status: { $exists: false } },
      { $set: { status: 'published', currentRevision: 0 } },
    )
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

  it('findAll returns only published, non-hidden recipes with no ratings or views attached', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ find })
    const result = await service.findAll()

    expect(find).toHaveBeenCalledWith({ hidden: { $ne: true }, status: 'published' })
    expect(result).toEqual([{ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0 }])
  })

  it('findAll attaches averageRating, ratingCount, and viewCount', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 4.5, count: 2 }])
    const service = await makeService({ find }, {}, { aggregate }, makeActivityLog(new Map([['a', 42]])))
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', averageRating: 4.5, ratingCount: 2, viewCount: 42 })
  })

  it('findBySlug returns the matching published recipe with ratings and views attached', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'a', toObject: () => ({ slug: 'a' }) })
    const findOne = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 3, count: 1 }])
    const service = await makeService({ findOne }, {}, { aggregate }, makeActivityLog(new Map([['a', 7]])))
    const result = await service.findBySlug('a')

    expect(findOne).toHaveBeenCalledWith({ slug: 'a', hidden: { $ne: true }, status: 'published' })
    expect(result).toEqual({ slug: 'a', averageRating: 3, ratingCount: 1, viewCount: 7, cookCount: 0 })
  })

  it('findBySlug excludes hidden or unpublished recipes', async () => {
    const exec = jest.fn().mockResolvedValue(null)
    const findOne = jest.fn().mockReturnValue({ exec })
    const service = await makeService({ findOne })
    const result = await service.findBySlug('hidden-one')

    expect(result).toBeNull()
  })

  it("findBySlugForUser returns the owner's own draft even though it is not published", async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', toObject: () => ({ slug: 'a', status: 'draft', ownerId: 'user_1' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'user_1', false)

    expect(result).toMatchObject({ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0 })
  })

  it('findBySlugForUser returns null for a draft belonging to someone else', async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', toObject: () => ({ slug: 'a' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'user_2', false)

    expect(result).toBeNull()
  })

  it('findBySlugForUser returns a draft belonging to someone else when the requester is an admin', async () => {
    const recipe = { slug: 'a', status: 'draft', ownerId: 'user_1', toObject: () => ({ slug: 'a', status: 'draft' }) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.findBySlugForUser('a', 'admin_1', true)

    expect(result).toMatchObject({ slug: 'a', status: 'draft' })
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

  it('createDraft slugifies the title and stores the recipe as a draft owned by the user', async () => {
    const exists = jest.fn().mockResolvedValue(null)
    const create = jest.fn().mockResolvedValue({ slug: 'tomato-soup', ...minimalDto })
    const service = await makeService({ exists, create })
    await service.createDraft('user_1', minimalDto as any)

    expect(exists).toHaveBeenCalledWith({ slug: 'tomato-soup' })
    expect(create).toHaveBeenCalledWith({ ...minimalDto, slug: 'tomato-soup', ownerId: 'user_1', status: 'draft' })
  })

  it('createDraft appends a numeric suffix when the slug is already taken', async () => {
    const exists = jest.fn().mockResolvedValueOnce({ _id: '1' }).mockResolvedValueOnce(null)
    const create = jest.fn().mockResolvedValue({ slug: 'tomato-soup-2', ...minimalDto })
    const service = await makeService({ exists, create })
    await service.createDraft('user_1', minimalDto as any)

    expect(create).toHaveBeenCalledWith({ ...minimalDto, slug: 'tomato-soup-2', ownerId: 'user_1', status: 'draft' })
  })

  it('updateDraft sets the recipe fields for the given slug when the requester owns it', async () => {
    const recipe = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', set: jest.fn(), save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    const result = await service.updateDraft('tomato-soup', 'user_1', false, minimalDto as any)

    expect(recipe.set).toHaveBeenCalledWith(minimalDto)
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
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

  it('updateDraft throws BadRequestException when a non-admin tries to edit a published recipe', async () => {
    const recipe = { slug: 'a', ownerId: 'user_1', status: 'published' }
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

  it('cancelSubmission moves a pending_review recipe back to draft', async () => {
    const recipe = { ownerId: 'user_1', status: 'pending_review', save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })
    await service.cancelSubmission('a', 'user_1', false)

    expect(recipe.status).toBe('draft')
    expect(recipe.save).toHaveBeenCalled()
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

  it('approveSubmission publishes the recipe and stores a revision snapshot', async () => {
    const recipe: any = { title: 'Tomato Soup', status: 'pending_review', currentRevision: 0, save: jest.fn().mockResolvedValue(undefined) }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const create = jest.fn().mockResolvedValue({})
    const service = await makeService({ findOne }, { create })
    const result = await service.approveSubmission('a', 'admin_1')

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ recipeSlug: 'a', revisionNumber: 1, authorId: 'admin_1' }))
    expect(recipe.status).toBe('published')
    expect(recipe.currentRevision).toBe(1)
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

  it('listRevisions returns revision snapshots newest first', async () => {
    const revisions = [{ revisionNumber: 2, authorId: 'admin_1', snapshot: {}, createdAt: new Date('2026-01-02') }]
    const exec = jest.fn().mockResolvedValue(revisions)
    const lean = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({}, { find })
    const result = await service.listRevisions('a')

    expect(find).toHaveBeenCalledWith({ recipeSlug: 'a' })
    expect(sort).toHaveBeenCalledWith({ revisionNumber: -1 })
    expect(result).toEqual([{ revisionNumber: 2, authorId: 'admin_1', snapshot: {}, publishedAt: new Date('2026-01-02') }])
  })

  it('remove deletes a draft recipe when the requester is its owner', async () => {
    const recipe = { status: 'draft', ownerId: 'user_1' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ findOne, deleteOne })
    await service.remove('tomato-soup', 'user_1', false)

    expect(deleteOne).toHaveBeenCalledWith({ slug: 'tomato-soup' })
  })

  it('remove throws ForbiddenException when a non-admin tries to delete a published recipe', async () => {
    const recipe = { status: 'published', ownerId: 'user_1' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn()
    const service = await makeService({ findOne, deleteOne })
    await expect(service.remove('tomato-soup', 'user_1', false)).rejects.toThrow(ForbiddenException)
    expect(deleteOne).not.toHaveBeenCalled()
  })

  it('remove allows an admin to delete a published recipe', async () => {
    const recipe = { status: 'published', ownerId: 'user_1' }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ findOne, deleteOne })
    await service.remove('tomato-soup', 'admin_1', true)

    expect(deleteOne).toHaveBeenCalledWith({ slug: 'tomato-soup' })
  })
})
