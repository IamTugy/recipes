import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rating, RatingSchema } from './schemas/rating.schema'
import { ReviewReply, ReviewReplySchema } from './schemas/review-reply.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { RatingsService } from './ratings.service'
import { ReviewRepliesService } from './review-replies.service'
import { RatingsController } from './ratings.controller'
import { UsersModule } from '../users/users.module'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rating.name, schema: RatingSchema },
      { name: ReviewReply.name, schema: ReviewReplySchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    UsersModule,
    ActivityLogModule,
    NotificationsModule,
  ],
  providers: [RatingsService, ReviewRepliesService],
  controllers: [RatingsController],
})
export class RatingsModule {}
