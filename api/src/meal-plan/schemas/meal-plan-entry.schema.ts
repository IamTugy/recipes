import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type MealPlanEntryDocument = MealPlanEntry & Document

@Schema({ timestamps: true })
export class MealPlanEntry {
  @Prop({ required: true, index: true })
  userId!: string

  // ISO date, e.g. "2026-08-03" - stored as a string so range queries
  // ($gte/$lte) work with plain lexicographic comparison, no timezone math.
  @Prop({ required: true, index: true })
  date!: string

  @Prop({ required: true })
  recipeSlug!: string

  @Prop({ enum: ['breakfast', 'lunch', 'dinner', 'snack'], default: 'dinner' })
  mealType!: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export const MealPlanEntrySchema = SchemaFactory.createForClass(MealPlanEntry)
