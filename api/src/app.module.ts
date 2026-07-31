import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'
import { RedisModule } from './redis/redis.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
    RedisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
