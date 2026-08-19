import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Timer, TimerSchema } from './schemas/timer.schema'
import { PushSubscription, PushSubscriptionSchema } from './schemas/push-subscription.schema'
import { TimersService } from './timers.service'
import { TimersController } from './timers.controller'
import { PushService } from './push.service'
import { PushController } from './push.controller'

@Module({
  imports: [MongooseModule.forFeature([
    { name: Timer.name, schema: TimerSchema },
    { name: PushSubscription.name, schema: PushSubscriptionSchema },
  ])],
  providers: [TimersService, PushService],
  controllers: [TimersController, PushController],
})
export class TimersModule {}
