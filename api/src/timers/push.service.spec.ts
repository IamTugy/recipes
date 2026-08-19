import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import * as webpush from 'web-push'
import { PushService } from './push.service'
import { PushSubscription } from './schemas/push-subscription.schema'

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}))

describe('PushService', () => {
  const subscriptionModel = {
    findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    find: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  async function makeService(config: Record<string, string | undefined> = {
    VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:test@example.com',
  }) {
    const configService = { get: jest.fn((key: string) => config[key]) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getModelToken(PushSubscription.name), useValue: subscriptionModel },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()
    return moduleRef.get(PushService)
  }

  it('getPublicKey returns the configured VAPID public key', async () => {
    const service = await makeService()
    expect(service.getPublicKey()).toBe('pub')
  })

  it('getPublicKey throws when VAPID_PUBLIC_KEY is not configured', async () => {
    const service = await makeService({ VAPID_PUBLIC_KEY: undefined })
    expect(() => service.getPublicKey()).toThrow('VAPID_PUBLIC_KEY is not configured')
  })

  it('subscribe upserts by endpoint', async () => {
    const service = await makeService()
    await service.subscribe('user_1', { endpoint: 'https://push.example/abc', keys: { p256dh: 'a', auth: 'b' } })
    expect(subscriptionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/abc' },
      { endpoint: 'https://push.example/abc', keys: { p256dh: 'a', auth: 'b' }, userId: 'user_1' },
      { upsert: true },
    )
  })

  it('unsubscribe deletes by endpoint', async () => {
    const service = await makeService()
    await service.unsubscribe('https://push.example/abc')
    expect(subscriptionModel.deleteOne).toHaveBeenCalledWith({ endpoint: 'https://push.example/abc' })
  })

  it('sendToUser sends to every subscription for that user', async () => {
    const subs = [
      { _id: '1', endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } },
      { _id: '2', endpoint: 'e2', keys: { p256dh: 'c', auth: 'd' } },
    ]
    subscriptionModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(subs) })
    ;(webpush.sendNotification as jest.Mock).mockResolvedValue(undefined)
    const service = await makeService()

    await service.sendToUser('user_1', { title: 'Timer done', body: 'Pasta' })

    expect(subscriptionModel.find).toHaveBeenCalledWith({ userId: 'user_1' })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } },
      JSON.stringify({ title: 'Timer done', body: 'Pasta' }),
    )
  })

  it('sendToUser deletes a subscription when web-push reports 410 Gone', async () => {
    const subs = [{ _id: '1', endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } }]
    subscriptionModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(subs) })
    ;(webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 })
    const service = await makeService()

    await service.sendToUser('user_1', { title: 'Timer done', body: 'Pasta' })

    expect(subscriptionModel.deleteOne).toHaveBeenCalledWith({ _id: '1' })
  })

  it('sendToUser leaves the subscription alone on any other failure', async () => {
    const subs = [{ _id: '1', endpoint: 'e1', keys: { p256dh: 'a', auth: 'b' } }]
    subscriptionModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(subs) })
    ;(webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 })
    const service = await makeService()

    await service.sendToUser('user_1', { title: 'Timer done', body: 'Pasta' })

    expect(subscriptionModel.deleteOne).not.toHaveBeenCalled()
  })
})
