import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { BadRequestException } from '@nestjs/common'
import { FollowsService } from './follows.service'
import { Follow } from './schemas/follow.schema'

describe('FollowsService', () => {
  const findOneAndUpdate = jest.fn()
  const deleteOne = jest.fn()
  const exists = jest.fn()
  const countDocuments = jest.fn()
  const find = jest.fn()

  const model = { findOneAndUpdate, deleteOne, exists, countDocuments, find }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [FollowsService, { provide: getModelToken(Follow.name), useValue: model }],
    }).compile()
    return moduleRef.get(FollowsService)
  }

  it('follow upserts a follow by followerId+followingId', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.follow('user_1', 'user_2')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { followerId: 'user_1', followingId: 'user_2' },
      { followerId: 'user_1', followingId: 'user_2' },
      { upsert: true },
    )
  })

  it('follow rejects following yourself', async () => {
    const service = await makeService()
    await expect(service.follow('user_1', 'user_1')).rejects.toThrow(BadRequestException)
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('unfollow deletes the follow by followerId+followingId', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.unfollow('user_1', 'user_2')
    expect(deleteOne).toHaveBeenCalledWith({ followerId: 'user_1', followingId: 'user_2' })
  })

  it('isFollowing returns true when a follow document exists', async () => {
    exists.mockResolvedValue({ _id: 'x' })
    const service = await makeService()
    await expect(service.isFollowing('user_1', 'user_2')).resolves.toBe(true)
    expect(exists).toHaveBeenCalledWith({ followerId: 'user_1', followingId: 'user_2' })
  })

  it('isFollowing returns false when no follow document exists', async () => {
    exists.mockResolvedValue(null)
    const service = await makeService()
    await expect(service.isFollowing('user_1', 'user_2')).resolves.toBe(false)
  })

  it('followerCount counts documents by followingId', async () => {
    countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(3) })
    const service = await makeService()
    await expect(service.followerCount('user_2')).resolves.toBe(3)
    expect(countDocuments).toHaveBeenCalledWith({ followingId: 'user_2' })
  })

  it('followingIds returns the followingId of every follow for a user', async () => {
    find.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ followingId: 'a' }, { followingId: 'b' }]) })
    const service = await makeService()
    await expect(service.followingIds('user_1')).resolves.toEqual(['a', 'b'])
    expect(find).toHaveBeenCalledWith({ followerId: 'user_1' })
  })
})
