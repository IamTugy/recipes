import { NotificationsController } from './notifications.controller'

describe('NotificationsController', () => {
  const notificationsService = {
    listForUser: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  }
  const usersService = { profilesByIds: jest.fn().mockResolvedValue({}) }

  beforeEach(() => jest.clearAllMocks())

  function makeController() {
    return new NotificationsController(notificationsService as any, usersService as any)
  }

  it('GET /notifications returns the requester\'s notifications with actor name/photo attached', async () => {
    notificationsService.listForUser.mockResolvedValue([
      { _id: 'n1', type: 'new_follower', actorId: 'user_2', read: false, createdAt: new Date('2026-01-01') },
    ])
    usersService.profilesByIds.mockResolvedValue({ user_2: { name: 'Tugy', imageUrl: 'https://img.clerk.dev/a.jpg' } })
    const controller = makeController()
    const result = await controller.list({ userId: 'user_1' } as any)
    expect(notificationsService.listForUser).toHaveBeenCalledWith('user_1')
    expect(usersService.profilesByIds).toHaveBeenCalledWith(['user_2'])
    expect(result).toEqual([{
      id: 'n1', type: 'new_follower', actorId: 'user_2',
      actorName: 'Tugy', actorImageUrl: 'https://img.clerk.dev/a.jpg',
      read: false, createdAt: new Date('2026-01-01'),
    }])
  })

  it('GET /notifications/unread-count returns the unread count', async () => {
    notificationsService.unreadCount.mockResolvedValue(3)
    const controller = makeController()
    await expect(controller.unreadCount({ userId: 'user_1' } as any)).resolves.toEqual({ count: 3 })
    expect(notificationsService.unreadCount).toHaveBeenCalledWith('user_1')
  })

  it('PATCH /notifications/:id/read marks a single notification read', async () => {
    const controller = makeController()
    await expect(controller.markRead('notif_1', { userId: 'user_1' } as any)).resolves.toEqual({ read: true })
    expect(notificationsService.markRead).toHaveBeenCalledWith('user_1', 'notif_1')
  })

  it('POST /notifications/read-all marks every notification read', async () => {
    const controller = makeController()
    await expect(controller.markAllRead({ userId: 'user_1' } as any)).resolves.toEqual({ read: true })
    expect(notificationsService.markAllRead).toHaveBeenCalledWith('user_1')
  })
})
