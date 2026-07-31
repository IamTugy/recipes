import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema'

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
}
