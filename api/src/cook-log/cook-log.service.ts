import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CookLog, CookLogDocument } from './schemas/cook-log.schema'

interface CookCountAggregate { _id: string; count: number }

@Injectable()
export class CookLogService {
  constructor(@InjectModel(CookLog.name) private readonly cookLogModel: Model<CookLogDocument>) {}

  async markCooked(userId: string, recipeId: string): Promise<void> {
    await this.cookLogModel
      .findOneAndUpdate({ userId, recipeId }, { userId, recipeId }, { upsert: true })
      .exec()
  }

  async unmarkCooked(userId: string, recipeId: string): Promise<void> {
    await this.cookLogModel.deleteOne({ userId, recipeId }).exec()
  }

  async listIds(userId: string): Promise<string[]> {
    const logs = await this.cookLogModel.find({ userId }).exec()
    return logs.map(l => l.recipeId)
  }

  async countsById(recipeIds: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.cookLogModel.aggregate([
      { $match: { recipeId: { $in: recipeIds } } },
      { $group: { _id: '$recipeId', count: { $sum: 1 } } },
    ])) as CookCountAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }
}
