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

  it('trendingSlugs returns recipeIds ordered by view count within the window', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 'a', count: 5 },
      { _id: 'b', count: 3 },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    const result = await service.trendingSlugs(6, 7)

    expect(result).toEqual(['a', 'b'])
    const pipeline = aggregate.mock.calls[0][0]
    expect(pipeline[0].$match.action).toBe('recipe_viewed')
    expect(pipeline).toEqual(expect.arrayContaining([
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]))
  })

  it('viewCountsBySlug returns an all-time view count per recipeId', async () => {
    const aggregate = jest.fn().mockResolvedValue([
      { _id: 'a', count: 12 },
      { _id: 'b', count: 4 },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { aggregate } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    const result = await service.viewCountsBySlug(['a', 'b', 'c'])

    expect(result.get('a')).toBe(12)
    expect(result.get('b')).toBe(4)
    expect(result.get('c')).toBeUndefined()
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { action: 'recipe_viewed', recipeId: { $in: ['a', 'b', 'c'] } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])
  })
})
