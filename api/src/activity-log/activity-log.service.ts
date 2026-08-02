import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema'

interface TrendingAggregate {
  _id: string
  count: number
}

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectModel(ActivityLog.name) private readonly activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async record(
    userId: string,
    recipeId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.activityLogModel.create({ userId, recipeId, action, metadata })
  }

  async trendingSlugs(limit = 6, sinceDays = 7): Promise<string[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    const aggregates = (await this.activityLogModel.aggregate([
      { $match: { action: 'recipe_viewed', timestamp: { $gte: since } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ])) as TrendingAggregate[]

    return aggregates.map(a => a._id)
  }

  // Counts unique (user, day) pairs per recipe rather than raw view events,
  // so a visitor refreshing the page all afternoon counts once, while
  // coming back tomorrow counts again.
  async viewCountsBySlug(recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.activityLogModel.aggregate([
      { $match: { action: 'recipe_viewed', recipeId: { $in: recipeIds } } },
      { $group: { _id: { recipeId: '$recipeId', userId: '$userId', day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } } } },
      { $group: { _id: '$_id.recipeId', count: { $sum: 1 } } },
    ])) as TrendingAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }
}
