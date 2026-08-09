import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema'

interface TrendingAggregate {
  _id: string
  count: number
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name)

  constructor(
    @InjectModel(ActivityLog.name) private readonly activityLogModel: Model<ActivityLogDocument>,
  ) {}

  // Analytics writes must never fail an already-committed mutation (or, in
  // submitForReview's case, abort the real work that hasn't happened yet) -
  // every call site does a bare `await`, so failures are swallowed here at
  // this single choke point instead of handled at each of the ~12 call sites.
  async record(
    userId: string,
    recipeId: string | undefined,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.activityLogModel.create({ userId, recipeId, action, metadata })
    } catch (err) {
      this.logger.error(`Failed to record activity log (action=${action}, userId=${userId})`, err instanceof Error ? err.stack : err)
    }
  }

  async trendingIds(limit = 6, sinceDays = 7): Promise<string[]> {
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
  async viewCountsById(recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.activityLogModel.aggregate([
      { $match: { action: 'recipe_viewed', recipeId: { $in: recipeIds } } },
      { $group: { _id: { recipeId: '$recipeId', userId: '$userId', day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } } } },
      { $group: { _id: '$_id.recipeId', count: { $sum: 1 } } },
    ])) as TrendingAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }
}
