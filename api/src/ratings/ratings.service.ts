import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rating, RatingDocument } from './schemas/rating.schema'

@Injectable()
export class RatingsService {
  constructor(@InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>) {}

  async rate(userId: string, recipeSlug: string, score: number): Promise<{ score: number }> {
    const doc = await this.ratingModel
      .findOneAndUpdate(
        { userId, recipeSlug },
        { userId, recipeSlug, score },
        { upsert: true, new: true },
      )
      .exec()
    return { score: doc!.score }
  }
}
