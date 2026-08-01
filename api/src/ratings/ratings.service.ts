import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rating, RatingDocument } from './schemas/rating.schema'

@Injectable()
export class RatingsService {
  constructor(@InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>) {}

  async rate(userId: string, recipeSlug: string, score: number, comment?: string): Promise<{ score: number }> {
    const doc = await this.ratingModel
      .findOneAndUpdate(
        { userId, recipeSlug },
        { userId, recipeSlug, score, comment: comment || undefined },
        { upsert: true, new: true },
      )
      .exec()
    return { score: doc!.score }
  }

  async reviewsForRecipe(recipeSlug: string, limit = 20): Promise<{ score: number; comment: string; createdAt: Date }[]> {
    const docs = await this.ratingModel
      .find({ recipeSlug, comment: { $exists: true, $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
    return docs.map(d => ({ score: d.score, comment: d.comment!, createdAt: (d as unknown as { createdAt: Date }).createdAt }))
  }
}
