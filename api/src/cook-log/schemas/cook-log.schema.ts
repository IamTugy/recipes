import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CookLogDocument = CookLog & Document

@Schema({ timestamps: true })
export class CookLog {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string
}

export const CookLogSchema = SchemaFactory.createForClass(CookLog)
CookLogSchema.index({ userId: 1, recipeSlug: 1 }, { unique: true })
