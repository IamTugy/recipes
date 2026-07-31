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
})
