import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ActivityLogService } from './activity-log.service'
import { ActivityLog } from './schemas/activity-log.schema'

describe('ActivityLogService', () => {
  it('record inserts an activity log document', async () => {
    const create = jest.fn().mockResolvedValue({})
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { create } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    await service.record('user_1', 'recipe-a', 'recipe_viewed')

    expect(create).toHaveBeenCalledWith({
      userId: 'user_1',
      recipeId: 'recipe-a',
      action: 'recipe_viewed',
      metadata: undefined,
    })
  })

  it('record swallows errors from a failed persist instead of throwing', async () => {
    const create = jest.fn().mockRejectedValue(new Error('Mongo hiccup'))
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { create } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)

    await expect(service.record('user_1', 'recipe-a', 'recipe_viewed')).resolves.toBeUndefined()
    expect(create).toHaveBeenCalledWith({
      userId: 'user_1',
      recipeId: 'recipe-a',
      action: 'recipe_viewed',
      metadata: undefined,
    })
  })

  it('trendingIds returns recipeIds ordered by view count within the window', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 'a', count: 5 },
      { _id: 'b', count: 3 },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    const result = await service.trendingIds(6, 7)

    expect(result).toEqual(['a', 'b'])
    const pipeline = aggregate.mock.calls[0][0]
    expect(pipeline[0].$match.action).toBe('recipe_viewed')
    expect(pipeline).toEqual(expect.arrayContaining([
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]))
  })

  it('viewCountsById returns a count of unique (user, day) pairs per recipeId', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 'a', count: 12 },
      { _id: 'b', count: 4 },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    const result = await service.viewCountsById(['a', 'b', 'c'])

    expect(result.get('a')).toBe(12)
    expect(result.get('b')).toBe(4)
    expect(result.get('c')).toBeUndefined()
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { action: 'recipe_viewed', recipeId: { $in: ['a', 'b', 'c'] } } },
      { $group: { _id: { recipeId: '$recipeId', userId: '$userId', day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } } } },
      { $group: { _id: '$_id.recipeId', count: { $sum: 1 } } },
    ])
  })

  it('pointsByUser sums per-action points, applies bonus rules, and sorts descending', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 'user_1', points: 55 },
      { _id: 'user_2', points: 8 },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    const result = await service.pointsByUser(
      { recipe_published: 50, rating_given: 8 },
      [{ action: 'rating_given', metadataKey: 'hasPhoto', bonus: 5 }],
      { limit: 20 },
    )

    expect(result.get('user_1')).toBe(55)
    expect(result.get('user_2')).toBe(8)
    const pipeline = aggregate.mock.calls[0][0]
    expect(pipeline).toEqual([
      {
        $addFields: {
          points: {
            $add: [
              {
                $switch: {
                  branches: [
                    { case: { $eq: ['$action', 'recipe_published'] }, then: 50 },
                    { case: { $eq: ['$action', 'rating_given'] }, then: 8 },
                  ],
                  default: 0,
                },
              },
              {
                $cond: [
                  { $and: [{ $eq: ['$action', 'rating_given'] }, { $eq: ['$metadata.hasPhoto', true] }] },
                  5,
                  0,
                ],
              },
            ],
          },
        },
      },
      { $group: { _id: '$userId', points: { $sum: '$points' } } },
      { $sort: { points: -1 } },
      { $limit: 20 },
    ])
  })

  it('pointsByUser scopes to specific userIds when provided', async () => {
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'user_1', points: 10 }])
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    await service.pointsByUser({ recipe_created: 5 }, [], { userIds: ['user_1'] })

    const pipeline = aggregate.mock.calls[0][0]
    expect(pipeline[0]).toEqual({ $match: { userId: { $in: ['user_1'] } } })
  })
})
