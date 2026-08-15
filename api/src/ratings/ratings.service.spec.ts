import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RatingsService } from './ratings.service'
import { Rating } from './schemas/rating.schema'
import { Recipe } from '../recipes/schemas/recipe.schema'
import { NotificationsService } from '../notifications/notifications.service'

describe('RatingsService', () => {
  function noRecipeLookup() {
    return { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(null) }) }) }) }
  }

  const notificationsService = { create: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  async function makeService(ratingModel: Record<string, unknown>, recipeModel: Record<string, unknown> = noRecipeLookup()) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: getModelToken(Rating.name), useValue: ratingModel },
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile()
    return moduleRef.get(RatingsService)
  }

  it("rate upserts the user's score for a recipe", async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 4 }) })
    const service = await makeService({ findOneAndUpdate })
    const result = await service.rate('user_1', 'a', 4)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeId: 'a' },
      { $set: { userId: 'user_1', recipeId: 'a', score: 4 } },
      { upsert: true, new: true },
    )
    expect(result).toEqual({ score: 4 })
  })

  it("rate does not touch an existing comment when re-rating without one", async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 5 }) })
    const service = await makeService({ findOneAndUpdate })
    await service.rate('user_1', 'a', 5, 'Loved it')

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeId: 'a' },
      { $set: { userId: 'user_1', recipeId: 'a', score: 5, comment: 'Loved it' } },
      { upsert: true, new: true },
    )
  })

  it('rate includes photoUrl in the update when provided', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 5 }) })
    const service = await makeService({ findOneAndUpdate })
    const photoUrl = 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg'
    await service.rate('user_1', 'a', 5, 'Loved it', photoUrl)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeId: 'a' },
      { $set: { userId: 'user_1', recipeId: 'a', score: 5, comment: 'Loved it', photoUrl } },
      { upsert: true, new: true },
    )
  })

  it("rate stamps the recipe's publishedRevision onto the rating when the recipe has been published", async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 5 }) })
    const recipeModel = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue({ publishedRevision: 3 }) }) }) }) }
    const service = await makeService({ findOneAndUpdate }, recipeModel)
    await service.rate('user_1', 'a', 5)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeId: 'a' },
      { $set: { userId: 'user_1', recipeId: 'a', score: 5, recipeRevision: 3 } },
      { upsert: true, new: true },
    )
  })

  it('rate notifies the recipe owner when someone else rates it', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 5 }) })
    const recipeModel = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue({ ownerId: 'owner_1' }) }) }) }) }
    const service = await makeService({ findOneAndUpdate }, recipeModel)
    await service.rate('user_1', 'a', 5)

    expect(notificationsService.create).toHaveBeenCalledWith('owner_1', 'new_rating', 'user_1', 'a')
  })

  it('rate does not notify when the recipe owner rates their own recipe', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 5 }) })
    const recipeModel = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue({ ownerId: 'owner_1' }) }) }) }) }
    const service = await makeService({ findOneAndUpdate }, recipeModel)
    await service.rate('owner_1', 'a', 5)

    expect(notificationsService.create).not.toHaveBeenCalled()
  })

  it("deleteRating deletes only the requesting user's rating for a recipe", async () => {
    const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ deleteOne })
    await service.deleteRating('user_1', 'a')

    expect(deleteOne).toHaveBeenCalledWith({ userId: 'user_1', recipeId: 'a' })
  })

  it("myRating returns the user's own score and comment for a recipe", async () => {
    const exec = jest.fn().mockResolvedValue({ score: 4, comment: 'Pretty good' })
    const lean = jest.fn().mockReturnValue({ exec })
    const findOne = jest.fn().mockReturnValue({ lean })
    const service = await makeService({ findOne })
    const result = await service.myRating('user_1', 'a')

    expect(findOne).toHaveBeenCalledWith({ userId: 'user_1', recipeId: 'a' })
    expect(result).toEqual({ score: 4, comment: 'Pretty good', photoUrl: null })
  })

  it('myRating returns null when the user has not rated the recipe', async () => {
    const exec = jest.fn().mockResolvedValue(null)
    const lean = jest.fn().mockReturnValue({ exec })
    const findOne = jest.fn().mockReturnValue({ lean })
    const service = await makeService({ findOne })
    await expect(service.myRating('user_1', 'a')).resolves.toBeNull()
  })

  it('reviewsForRecipe returns only reviews with a comment, newest first', async () => {
    const exec = jest.fn().mockResolvedValue([
      { _id: 'r1', userId: 'user_1', score: 5, comment: 'Amazing', upvotes: ['user_2'], recipeRevision: 2, createdAt: new Date('2026-01-02') },
    ])
    const lean = jest.fn().mockReturnValue({ exec })
    const limit = jest.fn().mockReturnValue({ lean })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })
    const result = await service.reviewsForRecipe('a')

    expect(find).toHaveBeenCalledWith({ recipeId: 'a', comment: { $exists: true, $ne: '' } })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(limit).toHaveBeenCalledWith(20)
    expect(result).toEqual([{
      id: 'r1', userId: 'user_1', score: 5, comment: 'Amazing', photoUrl: null,
      upvotes: ['user_2'], recipeRevision: 2, createdAt: new Date('2026-01-02'),
    }])
  })

  it('toggleUpvote adds the user to upvotes when not already present', async () => {
    const rating = { upvotes: [], save: jest.fn().mockResolvedValue(undefined) }
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(rating) })
    const service = await makeService({ findById })
    const result = await service.toggleUpvote('user_1', 'r1')

    expect(findById).toHaveBeenCalledWith('r1')
    expect(rating.upvotes).toEqual(['user_1'])
    expect(rating.save).toHaveBeenCalled()
    expect(result).toEqual({ upvoted: true, count: 1 })
  })

  it('toggleUpvote removes the user from upvotes when already present', async () => {
    const rating = { upvotes: ['user_1'], save: jest.fn().mockResolvedValue(undefined) }
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(rating) })
    const service = await makeService({ findById })
    const result = await service.toggleUpvote('user_1', 'r1')

    expect(rating.upvotes).toEqual([])
    expect(result).toEqual({ upvoted: false, count: 0 })
  })

  it('toggleUpvote throws when the review does not exist', async () => {
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService({ findById })
    await expect(service.toggleUpvote('user_1', 'missing')).rejects.toThrow('Review not found')
  })

  it('distributionForRecipe returns a count per score, defaulting missing scores to 0', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 5, count: 3 },
      { _id: 3, count: 1 },
    ])
    const service = await makeService({ aggregate })
    const result = await service.distributionForRecipe('a')

    expect(aggregate).toHaveBeenCalledWith([
      { $match: { recipeId: 'a' } },
      { $group: { _id: '$score', count: { $sum: 1 } } },
    ])
    expect(result).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 })
  })
})
