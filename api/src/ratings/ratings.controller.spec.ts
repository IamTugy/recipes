import { RatingsController } from './ratings.controller'

describe('RatingsController', () => {
  const ratingsService = { rate: jest.fn(), reviewsForRecipe: jest.fn(), distributionForRecipe: jest.fn(), myRating: jest.fn(), deleteRating: jest.fn(), toggleUpvote: jest.fn() }
  const reviewRepliesService = { countsByRatingIds: jest.fn(), listByRating: jest.fn(), create: jest.fn(), toggleUpvote: jest.fn() }
  const usersService = { namesByIds: jest.fn(), profilesByIds: jest.fn() }
  const activityLog = { record: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    reviewRepliesService.countsByRatingIds.mockResolvedValue({})
    usersService.namesByIds.mockResolvedValue({})
    usersService.profilesByIds.mockResolvedValue({})
  })

  function makeController() {
    return new RatingsController(ratingsService as any, reviewRepliesService as any, usersService as any, activityLog as any)
  }

  it('PUT /ratings/:slug rates the recipe as the current user', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = makeController()
    const result = await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5, undefined, undefined)
    expect(result).toEqual({ score: 5 })
  })

  it('PUT /ratings/:slug passes an optional comment through', async () => {
    ratingsService.rate.mockResolvedValue({ score: 4 })
    const controller = makeController()
    await controller.rate('a', { score: 4, comment: 'Great recipe!' }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 4, 'Great recipe!', undefined)
  })

  it('PUT /ratings/:slug passes an optional photoUrl through', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = makeController()
    const photoUrl = 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg'
    await controller.rate('a', { score: 5, comment: 'Great!', photoUrl }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5, 'Great!', photoUrl)
  })

  it('PUT /ratings/:slug logs a rating_given event with the score', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = makeController()
    await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'rating_given', { score: 5, hasPhoto: false })
  })

  it('PUT /ratings/:slug logs hasPhoto=true when a photoUrl is included', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = makeController()
    const photoUrl = 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg'
    await controller.rate('a', { score: 5, photoUrl }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'rating_given', { score: 5, hasPhoto: true })
  })

  it("GET /ratings/:slug/mine returns the current user's own rating", async () => {
    ratingsService.myRating.mockResolvedValue({ score: 4, comment: 'Pretty good' })
    const controller = makeController()
    const result = await controller.mine('a', { userId: 'user_1' } as any)
    expect(ratingsService.myRating).toHaveBeenCalledWith('user_1', 'a')
    expect(result).toEqual({ score: 4, comment: 'Pretty good' })
  })

  it('GET /ratings/:slug/reviews returns reviews enriched with names, photos, upvotes and reply counts', async () => {
    const reviews = [{ id: 'r1', userId: 'user_2', score: 5, comment: 'Loved it', upvotes: ['user_1'], createdAt: new Date('2026-01-01') }]
    ratingsService.reviewsForRecipe.mockResolvedValue(reviews)
    reviewRepliesService.countsByRatingIds.mockResolvedValue({ r1: 3 })
    usersService.profilesByIds.mockResolvedValue({ user_2: { name: 'Dana', imageUrl: 'https://img.clerk.dev/dana.jpg' } })
    const controller = makeController()
    const result = await controller.reviews('a', { userId: 'user_1' } as any)
    expect(ratingsService.reviewsForRecipe).toHaveBeenCalledWith('a')
    expect(result).toEqual([{
      id: 'r1', userId: 'user_2', score: 5, comment: 'Loved it', upvotes: ['user_1'], createdAt: new Date('2026-01-01'),
      userName: 'Dana', userImageUrl: 'https://img.clerk.dev/dana.jpg', upvoteCount: 1, upvotedByMe: true, replyCount: 3,
    }])
  })

  it("DELETE /ratings/:slug removes the current user's rating", async () => {
    const controller = makeController()
    const result = await controller.remove('a', { userId: 'user_1' } as any)
    expect(ratingsService.deleteRating).toHaveBeenCalledWith('user_1', 'a')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'rating_removed')
    expect(result).toEqual({ deleted: true })
  })

  it('GET /ratings/:slug/distribution returns the score distribution for a recipe', async () => {
    const distribution = { 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 }
    ratingsService.distributionForRecipe.mockResolvedValue(distribution)
    const controller = makeController()
    const result = await controller.distribution('a')
    expect(ratingsService.distributionForRecipe).toHaveBeenCalledWith('a')
    expect(result).toEqual(distribution)
  })

  it('POST /ratings/:slug/:ratingId/upvote toggles the upvote on a review', async () => {
    ratingsService.toggleUpvote.mockResolvedValue({ upvoted: true, count: 1 })
    const controller = makeController()
    const result = await controller.upvoteReview('r1', { userId: 'user_1' } as any)
    expect(ratingsService.toggleUpvote).toHaveBeenCalledWith('user_1', 'r1')
    expect(result).toEqual({ upvoted: true, count: 1 })
  })

  it('GET /ratings/:slug/:ratingId/replies lists replies with resolved names, photos and upvote state', async () => {
    reviewRepliesService.listByRating.mockResolvedValue([
      { _id: 'reply1', userId: 'user_2', text: 'Nice!', mentionedUserId: null, mentionedName: null, upvotes: ['user_1'], createdAt: new Date('2026-01-02') },
    ])
    usersService.profilesByIds.mockResolvedValue({ user_2: { name: 'Dana', imageUrl: 'https://img.clerk.dev/dana.jpg' } })
    const controller = makeController()
    const result = await controller.listReplies('r1', { userId: 'user_1' } as any)
    expect(reviewRepliesService.listByRating).toHaveBeenCalledWith('r1')
    expect(result).toEqual([{
      id: 'reply1', userId: 'user_2', userName: 'Dana', userImageUrl: 'https://img.clerk.dev/dana.jpg', text: 'Nice!',
      mentionedUserId: null, mentionedName: null, upvoteCount: 1, upvotedByMe: true, createdAt: new Date('2026-01-02'),
    }])
  })

  it('POST /ratings/:slug/:ratingId/replies creates a reply, resolving the mentioned user name and the poster\'s own profile', async () => {
    usersService.namesByIds.mockResolvedValue({ user_3: 'Avi' })
    usersService.profilesByIds.mockResolvedValue({ user_1: { name: 'Dana', imageUrl: 'https://img.clerk.dev/dana.jpg' } })
    reviewRepliesService.create.mockResolvedValue({
      _id: 'reply1', userId: 'user_1', text: '@Avi thanks!', mentionedUserId: 'user_3', mentionedName: 'Avi', createdAt: new Date('2026-01-02'),
    })
    const controller = makeController()
    const result = await controller.createReply('a', 'r1', { text: '@Avi thanks!', mentionedUserId: 'user_3' }, { userId: 'user_1' } as any)
    expect(reviewRepliesService.create).toHaveBeenCalledWith('r1', 'a', 'user_1', '@Avi thanks!', 'user_3', 'Avi')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'review_reply_posted')
    expect(result).toEqual({
      id: 'reply1', userId: 'user_1', userName: 'Dana', userImageUrl: 'https://img.clerk.dev/dana.jpg',
      text: '@Avi thanks!', mentionedUserId: 'user_3', mentionedName: 'Avi',
      upvoteCount: 0, upvotedByMe: false, createdAt: new Date('2026-01-02'),
    })
  })

  it('POST /ratings/:slug/:ratingId/replies creates a reply without a mention', async () => {
    reviewRepliesService.create.mockResolvedValue({
      _id: 'reply1', userId: 'user_1', text: 'Nice!', mentionedUserId: undefined, mentionedName: undefined, createdAt: new Date('2026-01-02'),
    })
    const controller = makeController()
    await controller.createReply('a', 'r1', { text: 'Nice!' }, { userId: 'user_1' } as any)
    expect(usersService.namesByIds).not.toHaveBeenCalled()
    expect(reviewRepliesService.create).toHaveBeenCalledWith('r1', 'a', 'user_1', 'Nice!', undefined, undefined)
  })

  it('POST /ratings/:slug/replies/:replyId/upvote toggles the upvote on a reply', async () => {
    reviewRepliesService.toggleUpvote.mockResolvedValue({ upvoted: false, count: 0 })
    const controller = makeController()
    const result = await controller.upvoteReply('reply1', { userId: 'user_1' } as any)
    expect(reviewRepliesService.toggleUpvote).toHaveBeenCalledWith('user_1', 'reply1')
    expect(result).toEqual({ upvoted: false, count: 0 })
  })
})
