import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller'
import { RedisService } from '../redis/redis.service'

describe('HealthController', () => {
  it('reports redis ok when ping succeeds', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: RedisService, useValue: { ping: async () => true } }],
    }).compile()

    const controller = moduleRef.get(HealthController)
    await expect(controller.check()).resolves.toEqual({ status: 'ok', redis: 'ok' })
  })

  it('reports redis unavailable when ping fails', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: RedisService, useValue: { ping: async () => false } }],
    }).compile()

    const controller = moduleRef.get(HealthController)
    await expect(controller.check()).resolves.toEqual({ status: 'ok', redis: 'unavailable' })
  })
})
