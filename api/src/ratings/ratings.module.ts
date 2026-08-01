import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rating, RatingSchema } from './schemas/rating.schema'
import { ReviewReply, ReviewReplySchema } from './schemas/review-reply.schema'
import { RatingsService } from './ratings.service'
import { ReviewRepliesService } from './review-replies.service'
import { RatingsController } from './ratings.controller'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Rating.name, schema: RatingSchema },
      { name: ReviewReply.name, schema: ReviewReplySchema },
    ]),
    UsersModule,
  ],
  providers: [RatingsService, ReviewRepliesService],
  controllers: [RatingsController],
})
export class RatingsModule {}
