import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ReviewRepliesService } from './review-replies.service'
import { ReviewReply } from './schemas/review-reply.schema'

describe('ReviewRepliesService', () => {
  it('create stores a reply under a review, with an optional mention', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'reply1', ratingId: 'r1', userId: 'user_2', text: 'Nice!' })
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewRepliesService, { provide: getModelToken(ReviewReply.name), useValue: { create } }],
    }).compile()

    const service = moduleRef.get(ReviewRepliesService)
    await service.create('r1', 'a', 'user_2', 'Nice!', 'user_1', 'Dana')

    expect(create).toHaveBeenCalledWith({
      ratingId: 'r1',
      recipeId: 'a',
      userId: 'user_2',
      text: 'Nice!',
      mentionedUserId: 'user_1',
      mentionedName: 'Dana',
    })
  })

  it('listByRating returns replies for a review, oldest first', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: 'reply1', ratingId: 'r1', userId: 'user_2', text: 'Nice!' }])
    const lean = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ sort })
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewRepliesService, { provide: getModelToken(ReviewReply.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(ReviewRepliesService)
    const result = await service.listByRating('r1')

    expect(find).toHaveBeenCalledWith({ ratingId: 'r1' })
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 })
    expect(result).toEqual([{ _id: 'reply1', ratingId: 'r1', userId: 'user_2', text: 'Nice!' }])
  })

  it('countsByRatingIds groups reply counts by rating', async () => {
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'r1', count: 2 }])
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewRepliesService, { provide: getModelToken(ReviewReply.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ReviewRepliesService)
    const result = await service.countsByRatingIds(['r1', 'r2'])

    expect(aggregate).toHaveBeenCalledWith([
      { $match: { ratingId: { $in: ['r1', 'r2'] } } },
      { $group: { _id: '$ratingId', count: { $sum: 1 } } },
    ])
    expect(result).toEqual({ r1: 2 })
  })

  it('countsByRatingIds returns an empty object without querying when given no ids', async () => {
    const aggregate = jest.fn()
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewRepliesService, { provide: getModelToken(ReviewReply.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ReviewRepliesService)
    const result = await service.countsByRatingIds([])

    expect(aggregate).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('toggleUpvote adds the user to a reply when not already upvoted', async () => {
    const reply = { upvotes: [], save: jest.fn().mockResolvedValue(undefined) }
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(reply) })
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewRepliesService, { provide: getModelToken(ReviewReply.name), useValue: { findById } }],
    }).compile()

    const service = moduleRef.get(ReviewRepliesService)
    const result = await service.toggleUpvote('user_1', 'reply1')

    expect(reply.upvotes).toEqual(['user_1'])
    expect(result).toEqual({ upvoted: true, count: 1 })
  })

  it('toggleUpvote throws when the reply does not exist', async () => {
    const findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewRepliesService, { provide: getModelToken(ReviewReply.name), useValue: { findById } }],
    }).compile()

    const service = moduleRef.get(ReviewRepliesService)
    await expect(service.toggleUpvote('user_1', 'missing')).rejects.toThrow('Reply not found')
  })
})
