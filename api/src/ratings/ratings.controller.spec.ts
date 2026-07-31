import { RatingsController } from './ratings.controller'

describe('RatingsController', () => {
  const ratingsService = { rate: jest.fn() }

  it('PUT /ratings/:slug rates the recipe as the current user', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5)
    expect(result).toEqual({ score: 5 })
  })
})
