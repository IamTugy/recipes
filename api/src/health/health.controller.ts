import { Controller, Get } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'
import { Public } from '../auth/public.decorator'

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Public()
  @Get()
  async check() {
    const redisOk = await this.redis.ping()
    return { status: 'ok', redis: redisOk ? 'ok' : 'unavailable' }
  }
}
