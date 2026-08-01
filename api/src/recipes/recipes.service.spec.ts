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
})
