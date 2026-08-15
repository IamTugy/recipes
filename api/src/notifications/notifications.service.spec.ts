import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { NotificationsService } from './notifications.service'
import { Notification } from './schemas/notification.schema'

describe('NotificationsService', () => {
  const findOneAndUpdate = jest.fn()
  const find = jest.fn()
  const countDocuments = jest.fn()
  const updateOne = jest.fn()
  const updateMany = jest.fn()

  const model = { findOneAndUpdate, find, countDocuments, updateOne, updateMany }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [NotificationsService, { provide: getModelToken(Notification.name), useValue: model }],
    }).compile()
    return moduleRef.get(NotificationsService)
  }

  it('create upserts by userId+type+actorId, refreshing it to unread', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.create('user_1', 'new_follower', 'user_2')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', type: 'new_follower', actorId: 'user_2' },
      { userId: 'user_1', type: 'new_follower', actorId: 'user_2', read: false },
      { upsert: true },
    )
  })

  it('create includes recipeId in the upsert key when given, so different recipes get separate notifications', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.create('owner_1', 'new_rating', 'user_2', 'recipe_a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'owner_1', type: 'new_rating', actorId: 'user_2', recipeId: 'recipe_a' },
      { userId: 'owner_1', type: 'new_rating', actorId: 'user_2', recipeId: 'recipe_a', read: false },
      { upsert: true },
    )
  })

  it('listForUser returns the caller\'s notifications, most recently updated first, capped', async () => {
    const limit = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ actorId: 'a' }]) })
    const sort = jest.fn().mockReturnValue({ limit })
    find.mockReturnValue({ sort })
    const service = await makeService()
    await expect(service.listForUser('user_1')).resolves.toEqual([{ actorId: 'a' }])
    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 })
    expect(limit).toHaveBeenCalledWith(50)
  })

  it('unreadCount counts unread notifications for the user', async () => {
    countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(2) })
    const service = await makeService()
    await expect(service.unreadCount('user_1')).resolves.toBe(2)
    expect(countDocuments).toHaveBeenCalledWith({ userId: 'user_1', read: false })
  })

  it('markRead marks a single notification read, scoped to the owning user', async () => {
    updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.markRead('user_1', 'notif_1')
    expect(updateOne).toHaveBeenCalledWith({ _id: 'notif_1', userId: 'user_1' }, { $set: { read: true } })
  })

  it('markAllRead marks every unread notification read for the user', async () => {
    updateMany.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.markAllRead('user_1')
    expect(updateMany).toHaveBeenCalledWith({ userId: 'user_1', read: false }, { $set: { read: true } })
  })
})
