import RedisMock from 'ioredis-mock'
import { RedisService } from './redis.service'

describe('RedisService', () => {
  it('ping returns true when redis responds PONG', async () => {
    const service = new RedisService(new RedisMock() as any)
    await expect(service.ping()).resolves.toBe(true)
  })

  it('ping returns false when redis throws', async () => {
    const client = new RedisMock()
    client.ping = jest.fn().mockRejectedValue(new Error('down'))
    const service = new RedisService(client as any)
    await expect(service.ping()).resolves.toBe(false)
  })
})
