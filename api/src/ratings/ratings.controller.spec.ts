import { RatingsController } from './ratings.controller'

describe('RatingsController', () => {
  const ratingsService = { rate: jest.fn(), reviewsForRecipe: jest.fn() }

  it('PUT /ratings/:slug rates the recipe as the current user', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5, undefined)
    expect(result).toEqual({ score: 5 })
  })

  it('PUT /ratings/:slug passes an optional comment through', async () => {
    ratingsService.rate.mockResolvedValue({ score: 4 })
    const controller = new RatingsController(ratingsService as any)
    await controller.rate('a', { score: 4, comment: 'Great recipe!' }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 4, 'Great recipe!')
  })

  it('GET /ratings/:slug/reviews returns the reviews for a recipe', async () => {
    const reviews = [{ score: 5, comment: 'Loved it', createdAt: new Date('2026-01-01') }]
    ratingsService.reviewsForRecipe.mockResolvedValue(reviews)
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.reviews('a')
    expect(ratingsService.reviewsForRecipe).toHaveBeenCalledWith('a')
    expect(result).toEqual(reviews)
  })
})
