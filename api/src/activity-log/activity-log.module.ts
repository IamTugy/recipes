import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema'
import { ActivityLogService } from './activity-log.service'
import { ActivityLogController } from './activity-log.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }])],
  providers: [ActivityLogService],
  controllers: [ActivityLogController],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
