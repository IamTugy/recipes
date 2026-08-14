import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CookLogDocument = CookLog & Document

@Schema({ timestamps: true })
export class CookLog {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true })
  cookedAt!: Date
}

export const CookLogSchema = SchemaFactory.createForClass(CookLog)
CookLogSchema.index({ userId: 1, recipeId: 1, cookedAt: -1 })
