import { Module } from '@nestjs/common'
import { FeatureRequestsService } from './feature-requests.service'
import { FeatureRequestsController } from './feature-requests.controller'

@Module({
  providers: [FeatureRequestsService],
  controllers: [FeatureRequestsController],
})
export class FeatureRequestsModule {}
