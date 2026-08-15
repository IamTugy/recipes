import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Follow, FollowSchema } from './schemas/follow.schema'
import { FollowsService } from './follows.service'
import { FollowsController } from './follows.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Follow.name, schema: FollowSchema }]),
    ActivityLogModule,
    NotificationsModule,
  ],
  providers: [FollowsService],
  controllers: [FollowsController],
  exports: [FollowsService],
})
export class FollowsModule {}
