import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CookLog, CookLogDocument } from './schemas/cook-log.schema'

interface CookCountAggregate { _id: string; count: number }

@Injectable()
export class CookLogService {
  constructor(@InjectModel(CookLog.name) private readonly cookLogModel: Model<CookLogDocument>) {}

  async markCooked(userId: string, recipeSlug: string): Promise<void> {
    await this.cookLogModel
      .findOneAndUpdate({ userId, recipeSlug }, { userId, recipeSlug }, { upsert: true })
      .exec()
  }

  async unmarkCooked(userId: string, recipeSlug: string): Promise<void> {
    await this.cookLogModel.deleteOne({ userId, recipeSlug }).exec()
  }

  async listSlugs(userId: string): Promise<string[]> {
    const logs = await this.cookLogModel.find({ userId }).exec()
    return logs.map(l => l.recipeSlug)
  }

  async countsBySlug(recipeSlugs: string[]): Promise<Map<string, number>> {
    const aggregates = (await this.cookLogModel.aggregate([
      { $match: { recipeSlug: { $in: recipeSlugs } } },
      { $group: { _id: '$recipeSlug', count: { $sum: 1 } } },
    ])) as CookCountAggregate[]

    return new Map(aggregates.map(a => [a._id, a.count]))
  }
}
