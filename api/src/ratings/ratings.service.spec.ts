import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RatingsService } from './ratings.service'
import { Rating } from './schemas/rating.schema'

describe('RatingsService', () => {
  it("rate upserts the user's score for a recipe", async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 4 }) })
    const moduleRef = await Test.createTestingModule({
      providers: [RatingsService, { provide: getModelToken(Rating.name), useValue: { findOneAndUpdate } }],
    }).compile()

    const service = moduleRef.get(RatingsService)
    const result = await service.rate('user_1', 'a', 4)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeSlug: 'a' },
      { userId: 'user_1', recipeSlug: 'a', score: 4 },
      { upsert: true, new: true },
    )
    expect(result).toEqual({ score: 4 })
  })

  it('reviewsForRecipe returns only reviews with a comment, newest first', async () => {
    const exec = jest.fn().mockResolvedValue([
      { score: 5, comment: 'Amazing', createdAt: new Date('2026-01-02') },
    ])
    const lean = jest.fn().mockReturnValue({ exec })
    const limit = jest.fn().mockReturnValue({ lean })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const moduleRef = await Test.createTestingModule({
      providers: [RatingsService, { provide: getModelToken(Rating.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(RatingsService)
    const result = await service.reviewsForRecipe('a')

    expect(find).toHaveBeenCalledWith({ recipeSlug: 'a', comment: { $exists: true, $ne: '' } })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(limit).toHaveBeenCalledWith(20)
    expect(result).toEqual([{ score: 5, comment: 'Amazing', createdAt: new Date('2026-01-02') }])
  })

  it('distributionForRecipe returns a count per score, defaulting missing scores to 0', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 5, count: 3 },
      { _id: 3, count: 1 },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [RatingsService, { provide: getModelToken(Rating.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(RatingsService)
    const result = await service.distributionForRecipe('a')

    expect(aggregate).toHaveBeenCalledWith([
      { $match: { recipeSlug: 'a' } },
      { $group: { _id: '$score', count: { $sum: 1 } } },
    ])
    expect(result).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 })
  })
})
