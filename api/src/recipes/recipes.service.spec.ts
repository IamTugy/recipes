import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipesService } from './recipes.service'
import { Recipe } from './schemas/recipe.schema'

describe('RecipesService', () => {
  it('findAll returns all non-hidden recipes', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a' }])
    const find = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [RecipesService, { provide: getModelToken(Recipe.name), useValue: { find, findOne: jest.fn() } }],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findAll()

    expect(find).toHaveBeenCalledWith({ hidden: { $ne: true } })
    expect(result).toEqual([{ slug: 'a' }])
  })

  it('findBySlug returns the matching recipe', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'a' })
    const findOne = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [RecipesService, { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne } }],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findBySlug('a')

    expect(findOne).toHaveBeenCalledWith({ slug: 'a', hidden: { $ne: true } })
    expect(result).toEqual({ slug: 'a' })
  })

  it('findBySlug excludes hidden recipes', async () => {
    // The mock stands in for Mongo: a hidden recipe does not match the filter,
    // so the query resolves null and the detail endpoint 404s instead of
    // serving (and logging a view for) a recipe excluded from listings.
    const exec = jest.fn().mockResolvedValue(null)
    const findOne = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [RecipesService, { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne } }],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findBySlug('hidden-one')

    expect(findOne).toHaveBeenCalledWith({ slug: 'hidden-one', hidden: { $ne: true } })
    expect(result).toBeNull()
  })
})
