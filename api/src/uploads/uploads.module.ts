import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { UploadsService } from './uploads.service'
import { UploadsController } from './uploads.controller'

@Module({
  imports: [AiModule, ActivityLogModule],
  providers: [UploadsService],
  controllers: [UploadsController],
})
export class UploadsModule {}
