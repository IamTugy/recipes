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
})
