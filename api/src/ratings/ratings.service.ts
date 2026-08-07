import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rating, RatingDocument } from './schemas/rating.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'

@Injectable()
export class RatingsService {
  constructor(
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
  ) {}

  async rate(userId: string, recipeId: string, score: number, comment?: string, photoUrl?: string): Promise<{ score: number }> {
    const setDoc: { userId: string; recipeId: string; score: number; comment?: string; photoUrl?: string; recipeRevision?: number } = { userId, recipeId, score }
    if (comment !== undefined) setDoc.comment = comment
    if (photoUrl !== undefined) setDoc.photoUrl = photoUrl
    const recipe = await this.recipeModel.findOne({ _id: recipeId }).select('publishedRevision').lean().exec()
    if (recipe?.publishedRevision != null) setDoc.recipeRevision = recipe.publishedRevision
    const doc = await this.ratingModel
      .findOneAndUpdate({ userId, recipeId }, { $set: setDoc }, { upsert: true, new: true })
      .exec()
    return { score: doc!.score }
  }

  async deleteRating(userId: string, recipeId: string): Promise<void> {
    await this.ratingModel.deleteOne({ userId, recipeId }).exec()
  }

  async myRating(userId: string, recipeId: string): Promise<{ score: number; comment: string | null; photoUrl: string | null } | null> {
    const doc = await this.ratingModel.findOne({ userId, recipeId }).lean().exec()
    if (!doc) return null
    return { score: doc.score, comment: doc.comment ?? null, photoUrl: doc.photoUrl ?? null }
  }

  async distributionForRecipe(recipeId: string): Promise<Record<1 | 2 | 3 | 4 | 5, number>> {
    const rows = await this.ratingModel.aggregate([
      { $match: { recipeId } },
      { $group: { _id: '$score', count: { $sum: 1 } } },
    ])
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const row of rows) {
      distribution[row._id as 1 | 2 | 3 | 4 | 5] = row.count
    }
    return distribution
  }

  async reviewsForRecipe(recipeId: string, limit = 20): Promise<{ id: string; userId: string; score: number; comment: string; photoUrl: string | null; upvotes: string[]; recipeRevision: number; createdAt: Date }[]> {
    const docs = await this.ratingModel
      .find({ recipeId, comment: { $exists: true, $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
    return docs.map(d => ({
      id: String(d._id),
      userId: d.userId,
      score: d.score,
      comment: d.comment!,
      photoUrl: d.photoUrl ?? null,
      upvotes: d.upvotes ?? [],
      recipeRevision: d.recipeRevision ?? 0,
      createdAt: (d as unknown as { createdAt: Date }).createdAt,
    }))
  }

  async toggleUpvote(userId: string, ratingId: string): Promise<{ upvoted: boolean; count: number }> {
    const rating = await this.ratingModel.findById(ratingId).exec()
    if (!rating) throw new NotFoundException('Review not found')
    const idx = rating.upvotes.indexOf(userId)
    const upvoted = idx === -1
    if (upvoted) rating.upvotes.push(userId)
    else rating.upvotes.splice(idx, 1)
    await rating.save()
    return { upvoted, count: rating.upvotes.length }
  }
}
