import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CookLog, CookLogDocument } from './schemas/cook-log.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'

interface CookCountAggregate { _id: string; count: number }

const COOLDOWN_FLOOR_MINUTES = 10

@Injectable()
export class CookLogService {
  constructor(
    @InjectModel(CookLog.name) private readonly cookLogModel: Model<CookLogDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly activityLog: ActivityLogService,
  ) {}

  // Called once, exactly when a guided cook session genuinely finishes
  // (CookSessionsService.finishSession) - never throws, since a failure
  // here must never be allowed to block that method from completing.
  async recordCook(userId: string, recipeId: string): Promise<void> {
    try {
      const recipe = await this.recipeModel.findOne({ _id: recipeId }).exec()
      const cooldownMinutes = Math.max(
        (recipe?.prepTime ?? 0) + (recipe?.cookTime ?? 0),
        COOLDOWN_FLOOR_MINUTES,
      )

      const lastCook = await this.cookLogModel
        .findOne({ userId, recipeId })
        .sort({ cookedAt: -1 })
        .exec()

      if (lastCook) {
        const minutesSinceLastCook = (Date.now() - lastCook.cookedAt.getTime()) / 60000
        if (minutesSinceLastCook < cooldownMinutes) return
      }

      await this.cookLogModel.create({ userId, recipeId, cookedAt: new Date() })
      await this.activityLog.record(userId, recipeId, 'recipe_cooked')
    } catch {
      // Counting a cook is a non-critical side effect - never let a
      // failure here surface to the caller.
    }
  }

  async countsById(recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.cookLogModel.aggregate([
      { $match: { recipeId: { $in: recipeIds } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])) as CookCountAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }

  async userCountsById(userId: string, recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.cookLogModel.aggregate([
      { $match: { userId, recipeId: { $in: recipeIds } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])) as CookCountAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }
}
