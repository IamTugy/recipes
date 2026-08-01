import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rating, RatingDocument } from './schemas/rating.schema'

@Injectable()
export class RatingsService {
  constructor(@InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>) {}

  async rate(userId: string, recipeSlug: string, score: number, comment?: string, photoUrl?: string): Promise<{ score: number }> {
    const setDoc: { userId: string; recipeSlug: string; score: number; comment?: string; photoUrl?: string } = { userId, recipeSlug, score }
    if (comment !== undefined) setDoc.comment = comment
    if (photoUrl !== undefined) setDoc.photoUrl = photoUrl
    const doc = await this.ratingModel
      .findOneAndUpdate({ userId, recipeSlug }, { $set: setDoc }, { upsert: true, new: true })
      .exec()
    return { score: doc!.score }
  }

  async myRating(userId: string, recipeSlug: string): Promise<{ score: number; comment: string | null; photoUrl: string | null } | null> {
    const doc = await this.ratingModel.findOne({ userId, recipeSlug }).lean().exec()
    if (!doc) return null
    return { score: doc.score, comment: doc.comment ?? null, photoUrl: doc.photoUrl ?? null }
  }

  async distributionForRecipe(recipeSlug: string): Promise<Record<1 | 2 | 3 | 4 | 5, number>> {
    const rows = await this.ratingModel.aggregate([
      { $match: { recipeSlug } },
      { $group: { _id: '$score', count: { $sum: 1 } } },
    ])
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const row of rows) {
      distribution[row._id as 1 | 2 | 3 | 4 | 5] = row.count
    }
    return distribution
  }

  async reviewsForRecipe(recipeSlug: string, limit = 20): Promise<{ score: number; comment: string; photoUrl: string | null; createdAt: Date }[]> {
    const docs = await this.ratingModel
      .find({ recipeSlug, comment: { $exists: true, $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
    return docs.map(d => ({
      score: d.score,
      comment: d.comment!,
      photoUrl: d.photoUrl ?? null,
      createdAt: (d as unknown as { createdAt: Date }).createdAt,
    }))
  }
}
