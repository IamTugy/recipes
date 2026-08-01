import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipesService } from './recipes.service'
import { Recipe } from './schemas/recipe.schema'
import { Rating } from '../ratings/schemas/rating.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'

describe('RecipesService', () => {
  function makeActivityLog(viewCounts: Map<string, number> = new Map()) {
    return { viewCountsBySlug: jest.fn().mockResolvedValue(viewCounts) }
  }

  it('findAll returns all non-hidden recipes with no ratings or views attached', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a', toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find, findOne: jest.fn() } },
        { provide: getModelToken(Rating.name), useValue: { aggregate } },
        { provide: ActivityLogService, useValue: makeActivityLog() },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findAll()

    expect(find).toHaveBeenCalledWith({ hidden: { $ne: true } })
    expect(result).toEqual([{ slug: 'a', averageRating: null, ratingCount: 0, viewCount: 0 }])
  })

  it('findAll attaches averageRating, ratingCount, and viewCount', async () => {
    const recipesExec = jest.fn().mockResolvedValue([{ slug: 'a', toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec: recipesExec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 4.5, count: 2 }])
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find, findOne: jest.fn() } },
        { provide: getModelToken(Rating.name), useValue: { aggregate } },
        { provide: ActivityLogService, useValue: makeActivityLog(new Map([['a', 42]])) },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', averageRating: 4.5, ratingCount: 2, viewCount: 42 })
  })

  it('findBySlug returns the matching recipe with ratings and views attached', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'a', toObject: () => ({ slug: 'a' }) })
    const findOne = jest.fn().mockReturnValue({ exec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 3, count: 1 }])
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne } },
        { provide: getModelToken(Rating.name), useValue: { aggregate } },
        { provide: ActivityLogService, useValue: makeActivityLog(new Map([['a', 7]])) },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findBySlug('a')

    expect(findOne).toHaveBeenCalledWith({ slug: 'a', hidden: { $ne: true } })
    expect(result).toEqual({ slug: 'a', averageRating: 3, ratingCount: 1, viewCount: 7 })
  })

  it('findBySlug excludes hidden recipes', async () => {
    // The mock stands in for Mongo: a hidden recipe does not match the filter,
    // so the query resolves null and the detail endpoint 404s instead of
    // serving (and logging a view for) a recipe excluded from listings.
    const exec = jest.fn().mockResolvedValue(null)
    const findOne = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne } },
        { provide: getModelToken(Rating.name), useValue: { aggregate: jest.fn() } },
        { provide: ActivityLogService, useValue: makeActivityLog() },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findBySlug('hidden-one')

    expect(findOne).toHaveBeenCalledWith({ slug: 'hidden-one', hidden: { $ne: true } })
    expect(result).toBeNull()
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

  it('create slugifies the title and stores the recipe', async () => {
    const exists = jest.fn().mockResolvedValue(null)
    const create = jest.fn().mockResolvedValue({ slug: 'tomato-soup', ...minimalDto })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne: jest.fn(), exists, create } },
        { provide: getModelToken(Rating.name), useValue: { aggregate: jest.fn() } },
        { provide: ActivityLogService, useValue: makeActivityLog() },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    await service.create(minimalDto as any)

    expect(exists).toHaveBeenCalledWith({ slug: 'tomato-soup' })
    expect(create).toHaveBeenCalledWith({ ...minimalDto, slug: 'tomato-soup' })
  })

  it('create appends a numeric suffix when the slug is already taken', async () => {
    const exists = jest.fn()
      .mockResolvedValueOnce({ _id: '1' })
      .mockResolvedValueOnce(null)
    const create = jest.fn().mockResolvedValue({ slug: 'tomato-soup-2', ...minimalDto })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne: jest.fn(), exists, create } },
        { provide: getModelToken(Rating.name), useValue: { aggregate: jest.fn() } },
        { provide: ActivityLogService, useValue: makeActivityLog() },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    await service.create(minimalDto as any)

    expect(create).toHaveBeenCalledWith({ ...minimalDto, slug: 'tomato-soup-2' })
  })

  it('update sets the recipe fields for the given slug', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'tomato-soup', ...minimalDto })
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne: jest.fn(), findOneAndUpdate } },
        { provide: getModelToken(Rating.name), useValue: { aggregate: jest.fn() } },
        { provide: ActivityLogService, useValue: makeActivityLog() },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.update('tomato-soup', minimalDto as any)

    expect(findOneAndUpdate).toHaveBeenCalledWith({ slug: 'tomato-soup' }, { $set: minimalDto }, { new: true })
    expect(result).toEqual({ slug: 'tomato-soup', ...minimalDto })
  })

  it('remove deletes the recipe by slug', async () => {
    const exec = jest.fn().mockResolvedValue({})
    const deleteOne = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne: jest.fn(), deleteOne } },
        { provide: getModelToken(Rating.name), useValue: { aggregate: jest.fn() } },
        { provide: ActivityLogService, useValue: makeActivityLog() },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    await service.remove('tomato-soup')

    expect(deleteOne).toHaveBeenCalledWith({ slug: 'tomato-soup' })
  })
})
