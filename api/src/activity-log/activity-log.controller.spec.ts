import { ActivityLogController } from './activity-log.controller'

describe('ActivityLogController', () => {
  const activityLogService = { record: jest.fn() }
  const controller = new ActivityLogController(activityLogService as any)

  beforeEach(() => jest.clearAllMocks())

  it('POST /activity/search logs a search_performed event with the query and result count', async () => {
    const result = await controller.logSearch({ query: 'pasta', resultsCount: 12 }, { userId: 'user_1' } as any)

    expect(activityLogService.record).toHaveBeenCalledWith('user_1', undefined, 'search_performed', { query: 'pasta', resultsCount: 12 })
    expect(result).toEqual({ logged: true })
  })
})
