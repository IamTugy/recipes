import { RankingController } from './ranking.controller'

describe('RankingController', () => {
  const rankingService = { leaderboard: jest.fn(), pointsForUser: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function makeController() {
    return new RankingController(rankingService as any)
  }

  it('GET /ranking/leaderboard defaults the limit when none is given', async () => {
    rankingService.leaderboard.mockResolvedValue([])
    const controller = makeController()
    await controller.leaderboard(undefined)
    expect(rankingService.leaderboard).toHaveBeenCalledWith(undefined)
  })

  it('GET /ranking/leaderboard passes a parsed numeric limit through', async () => {
    rankingService.leaderboard.mockResolvedValue([])
    const controller = makeController()
    await controller.leaderboard('5')
    expect(rankingService.leaderboard).toHaveBeenCalledWith(5)
  })

  it('GET /ranking/leaderboard ignores a non-positive limit', async () => {
    rankingService.leaderboard.mockResolvedValue([])
    const controller = makeController()
    await controller.leaderboard('-3')
    expect(rankingService.leaderboard).toHaveBeenCalledWith(undefined)
  })

  it('GET /ranking/me returns the current user\'s points', async () => {
    rankingService.pointsForUser.mockResolvedValue(42)
    const controller = makeController()
    const result = await controller.me({ userId: 'user_1' } as any)
    expect(rankingService.pointsForUser).toHaveBeenCalledWith('user_1')
    expect(result).toEqual({ userId: 'user_1', points: 42 })
  })
})
