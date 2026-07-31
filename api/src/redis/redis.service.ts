import { Injectable, Inject } from '@nestjs/common'
import type Redis from 'ioredis'

export const REDIS_CLIENT = 'REDIS_CLIENT'

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping()
      return reply === 'PONG'
    } catch {
      return false
    }
  }
}
