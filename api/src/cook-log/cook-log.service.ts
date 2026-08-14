import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CookLog, CookLogDocument } from './schemas/cook-log.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'

interface CookCountAggregate { _id: string; count: number }

const COOLDOWN_FLOOR_MINUTES = 10

@Injectable()
export class CookLogService implements OnModuleInit {
  private readonly logger = new Logger(CookLogService.name)

  constructor(
    @InjectModel(CookLog.name) private readonly cookLogModel: Model<CookLogDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly activityLog: ActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.cookLogModel.syncIndexes()
    } catch (err) {
      this.logger.error('Failed to sync CookLog indexes on startup', err instanceof Error ? err.stack : err)
    }
  }

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

      if (lastCook?.cookedAt) {
        const minutesSinceLastCook = (Date.now() - lastCook.cookedAt.getTime()) / 60000
        if (minutesSinceLastCook < cooldownMinutes) return
      }

      await this.cookLogModel.create({ userId, recipeId, cookedAt: new Date() })
      await this.activityLog.record(userId, recipeId, 'recipe_cooked')
    } catch (err) {
      // Counting a cook is a non-critical side effect - never let a
      // failure here surface to the caller, but log it so a silent
      // failure mode (e.g. a stale index, a schema mismatch) is
      // diagnosable instead of invisible.
      this.logger.error(`Failed to record cook for user ${userId} on recipe ${recipeId}`, err instanceof Error ? err.stack : err)
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
