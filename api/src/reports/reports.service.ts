import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Report, ReportDocument, ReportReason } from './schemas/report.schema'

@Injectable()
export class ReportsService {
  constructor(@InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>) {}

  // One open report per reporter+recipe, same as RatingsService's
  // upsert-by-userId+recipeId pattern - re-reporting updates the existing
  // record (and reopens it if an admin had already resolved it) instead of
  // letting the same user spam duplicate rows for the same recipe.
  async create(recipeId: string, reporterId: string, reason: ReportReason, message?: string): Promise<void> {
    await this.reportModel
      .findOneAndUpdate(
        { recipeId, reporterId },
        { recipeId, reporterId, reason, message, resolved: false },
        { upsert: true },
      )
      .exec()
  }

  async listAll(): Promise<ReportDocument[]> {
    return this.reportModel.find().sort({ createdAt: -1 }).exec()
  }

  async resolve(id: string, resolved: boolean): Promise<void> {
    await this.reportModel.updateOne({ _id: id }, { $set: { resolved } }).exec()
  }
}
