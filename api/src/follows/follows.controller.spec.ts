import { FollowsController } from './follows.controller'

describe('FollowsController', () => {
  const followsService = {
    follow: jest.fn(),
    unfollow: jest.fn(),
    isFollowing: jest.fn(),
    followerCount: jest.fn(),
    followingIds: jest.fn(),
  }
  const activityLog = { record: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it("GET /follows returns the current user's following ids", async () => {
    followsService.followingIds.mockResolvedValue(['user_2', 'user_3'])
    const controller = new FollowsController(followsService as any, activityLog as any)
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual(['user_2', 'user_3'])
  })

  it('GET /follows/:userId/status returns whether the requester follows them plus their follower count', async () => {
    followsService.isFollowing.mockResolvedValue(true)
    followsService.followerCount.mockResolvedValue(5)
    const controller = new FollowsController(followsService as any, activityLog as any)
    const result = await controller.status('user_2', { userId: 'user_1' } as any)
    expect(followsService.isFollowing).toHaveBeenCalledWith('user_1', 'user_2')
    expect(followsService.followerCount).toHaveBeenCalledWith('user_2')
    expect(result).toEqual({ following: true, followerCount: 5 })
  })

  it('POST /follows/:userId follows the chef and logs the action', async () => {
    const controller = new FollowsController(followsService as any, activityLog as any)
    const result = await controller.follow('user_2', { userId: 'user_1' } as any)
    expect(followsService.follow).toHaveBeenCalledWith('user_1', 'user_2')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'chef_followed', { chefUserId: 'user_2' })
    expect(result).toEqual({ following: true })
  })

  it('DELETE /follows/:userId unfollows the chef and logs the action', async () => {
    const controller = new FollowsController(followsService as any, activityLog as any)
    const result = await controller.unfollow('user_2', { userId: 'user_1' } as any)
    expect(followsService.unfollow).toHaveBeenCalledWith('user_1', 'user_2')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'chef_unfollowed', { chefUserId: 'user_2' })
    expect(result).toEqual({ following: false })
  })
})
