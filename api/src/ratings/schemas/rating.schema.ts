import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type RatingDocument = Rating & Document

@Schema({ timestamps: true })
export class Rating {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string

  @Prop({ required: true, min: 1, max: 5 })
  score!: number

  @Prop({ maxlength: 500 })
  comment?: string
}

export const RatingSchema = SchemaFactory.createForClass(Rating)
RatingSchema.index({ userId: 1, recipeSlug: 1 }, { unique: true })
