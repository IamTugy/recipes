import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rating, RatingSchema } from './schemas/rating.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: Rating.name, schema: RatingSchema }])],
})
export class RatingsModule {}
