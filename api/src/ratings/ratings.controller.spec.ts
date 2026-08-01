import { RatingsController } from './ratings.controller'

describe('RatingsController', () => {
  const ratingsService = { rate: jest.fn(), reviewsForRecipe: jest.fn(), distributionForRecipe: jest.fn(), myRating: jest.fn(), deleteRating: jest.fn() }

  it('PUT /ratings/:slug rates the recipe as the current user', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5, undefined, undefined)
    expect(result).toEqual({ score: 5 })
  })

  it('PUT /ratings/:slug passes an optional comment through', async () => {
    ratingsService.rate.mockResolvedValue({ score: 4 })
    const controller = new RatingsController(ratingsService as any)
    await controller.rate('a', { score: 4, comment: 'Great recipe!' }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 4, 'Great recipe!', undefined)
  })

  it('PUT /ratings/:slug passes an optional photoUrl through', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = new RatingsController(ratingsService as any)
    const photoUrl = 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg'
    await controller.rate('a', { score: 5, comment: 'Great!', photoUrl }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5, 'Great!', photoUrl)
  })

  it("GET /ratings/:slug/mine returns the current user's own rating", async () => {
    ratingsService.myRating.mockResolvedValue({ score: 4, comment: 'Pretty good' })
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.mine('a', { userId: 'user_1' } as any)
    expect(ratingsService.myRating).toHaveBeenCalledWith('user_1', 'a')
    expect(result).toEqual({ score: 4, comment: 'Pretty good' })
  })

  it('GET /ratings/:slug/reviews returns the reviews for a recipe', async () => {
    const reviews = [{ score: 5, comment: 'Loved it', createdAt: new Date('2026-01-01') }]
    ratingsService.reviewsForRecipe.mockResolvedValue(reviews)
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.reviews('a')
    expect(ratingsService.reviewsForRecipe).toHaveBeenCalledWith('a')
    expect(result).toEqual(reviews)
  })

  it("DELETE /ratings/:slug removes the current user's rating", async () => {
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.remove('a', { userId: 'user_1' } as any)
    expect(ratingsService.deleteRating).toHaveBeenCalledWith('user_1', 'a')
    expect(result).toEqual({ deleted: true })
  })

  it('GET /ratings/:slug/distribution returns the score distribution for a recipe', async () => {
    const distribution = { 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 }
    ratingsService.distributionForRecipe.mockResolvedValue(distribution)
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.distribution('a')
    expect(ratingsService.distributionForRecipe).toHaveBeenCalledWith('a')
    expect(result).toEqual(distribution)
  })
})
