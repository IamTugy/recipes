import { Module, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { RedisService, REDIS_CLIENT } from './redis.service'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.get<string>('REDIS_URL')!),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
