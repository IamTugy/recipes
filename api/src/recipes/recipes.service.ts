import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from './schemas/recipe.schema'
import { Rating, RatingDocument } from '../ratings/schemas/rating.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'

interface RatingAggregate {
  _id: string
  avg: number
  count: number
}

@Injectable()
export class RecipesService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private async ratingsBySlug(slugs: string[]): Promise<Map<string, { avg: number; count: number }>> {
    const aggregates = (await this.ratingModel.aggregate([
      { $match: { recipeSlug: { $in: slugs } } },
      { $group: { _id: '$recipeSlug', avg: { $avg: '$score' }, count: { $sum: 1 } } },
    ])) as RatingAggregate[]

    return new Map(aggregates.map(a => [a._id, { avg: a.avg, count: a.count }]))
  }

  private attachRatingsAndViews<T extends { slug: string }>(
    recipes: T[],
    ratings: Map<string, { avg: number; count: number }>,
    views: Map<string, number>,
  ) {
    return recipes.map(recipe => {
      const rating = ratings.get(recipe.slug)
      return {
        ...recipe,
        averageRating: rating ? Math.round(rating.avg * 10) / 10 : null,
        ratingCount: rating?.count ?? 0,
        viewCount: views.get(recipe.slug) ?? 0,
      }
    })
  }

  async findAll() {
    const recipes = await this.recipeModel.find({ hidden: { $ne: true } }).exec()
    const plain = recipes.map(r => r.toObject())
    const slugs = plain.map(r => r.slug)
    const [ratings, views] = await Promise.all([
      this.ratingsBySlug(slugs),
      this.activityLogService.viewCountsBySlug(slugs),
    ])
    return this.attachRatingsAndViews(plain, ratings, views)
  }

  async findBySlug(slug: string) {
    const recipe = await this.recipeModel.findOne({ slug, hidden: { $ne: true } }).exec()
    if (!recipe) return null
    const [ratings, views] = await Promise.all([
      this.ratingsBySlug([slug]),
      this.activityLogService.viewCountsBySlug([slug]),
    ])
    return this.attachRatingsAndViews([recipe.toObject()], ratings, views)[0]
  }
}
