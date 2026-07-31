import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema'
import { ActivityLogService } from './activity-log.service'

@Module({
  imports: [MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }])],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
