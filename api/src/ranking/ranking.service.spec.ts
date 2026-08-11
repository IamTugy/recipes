import { RankingService } from './ranking.service'

describe('RankingService', () => {
  const activityLogService = { pointsByUser: jest.fn() }
  const usersService = { namesByIds: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function makeService() {
    return new RankingService(activityLogService as any, usersService as any)
  }

  it('pointsForUser returns 0 when the user has no scored activity', async () => {
    activityLogService.pointsByUser.mockResolvedValue(new Map())
    const service = makeService()

    const result = await service.pointsForUser('user_1')

    expect(result).toBe(0)
    expect(activityLogService.pointsByUser).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      { userIds: ['user_1'] },
    )
  })

  it('pointsForUser returns the aggregated points for that user', async () => {
    activityLogService.pointsByUser.mockResolvedValue(new Map([['user_1', 42]]))
    const service = makeService()

    expect(await service.pointsForUser('user_1')).toBe(42)
  })

  it('leaderboard ranks users by points and enriches with names', async () => {
    activityLogService.pointsByUser.mockResolvedValue(new Map([['user_1', 55], ['user_2', 8]]))
    usersService.namesByIds.mockResolvedValue({ user_1: 'Alice', user_2: undefined })
    const service = makeService()

    const result = await service.leaderboard(10)

    expect(result).toEqual([
      { userId: 'user_1', name: 'Alice', points: 55, rank: 1 },
      { userId: 'user_2', name: null, points: 8, rank: 2 },
    ])
    expect(activityLogService.pointsByUser).toHaveBeenCalledWith(expect.any(Object), expect.any(Array), { limit: 10 })
  })
})
