import { Module } from '@nestjs/common'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { UsersModule } from '../users/users.module'
import { RankingService } from './ranking.service'
import { RankingController } from './ranking.controller'

@Module({
  imports: [ActivityLogModule, UsersModule],
  providers: [RankingService],
  controllers: [RankingController],
  exports: [RankingService],
})
export class RankingModule {}
