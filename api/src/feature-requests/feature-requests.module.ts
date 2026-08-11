import { Module } from '@nestjs/common'
import { FeatureRequestsService } from './feature-requests.service'
import { FeatureRequestsController } from './feature-requests.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [ActivityLogModule],
  providers: [FeatureRequestsService],
  controllers: [FeatureRequestsController],
})
export class FeatureRequestsModule {}
