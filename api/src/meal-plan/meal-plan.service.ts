import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { MealPlanEntry, MealPlanEntryDocument } from './schemas/meal-plan-entry.schema'
import { AddMealPlanEntryDto } from './dto/add-meal-plan-entry.dto'

@Injectable()
export class MealPlanService {
  constructor(@InjectModel(MealPlanEntry.name) private readonly entryModel: Model<MealPlanEntryDocument>) {}

  async listForRange(userId: string, start: string, end: string) {
    const entries = await this.entryModel
      .find({ userId, date: { $gte: start, $lte: end } })
      .sort({ date: 1 })
      .lean()
      .exec()
    return entries.map(e => ({
      id: String(e._id),
      date: e.date,
      recipeId: e.recipeId,
      mealType: e.mealType,
    }))
  }

  async add(userId: string, dto: AddMealPlanEntryDto) {
    const entry = await this.entryModel.create({
      userId,
      date: dto.date,
      recipeId: dto.recipeId,
      mealType: dto.mealType ?? 'dinner',
    })
    return { id: String(entry._id), date: entry.date, recipeId: entry.recipeId, mealType: entry.mealType }
  }

  async remove(userId: string, id: string): Promise<void> {
    const entry = await this.entryModel.findById(id).exec()
    if (!entry) throw new NotFoundException('Meal plan entry not found')
    if (entry.userId !== userId) throw new ForbiddenException('Only the owner can remove this entry')
    await this.entryModel.deleteOne({ _id: id }).exec()
  }
}
