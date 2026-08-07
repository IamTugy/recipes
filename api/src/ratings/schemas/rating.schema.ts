import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type RatingDocument = Rating & Document

@Schema({ timestamps: true })
export class Rating {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true, min: 1, max: 5 })
  score!: number

  @Prop({ maxlength: 500 })
  comment?: string

  @Prop()
  photoUrl?: string

  @Prop({ type: [String], default: [] })
  upvotes!: string[]

  // The recipe's currentRevision at the moment this rating/review was
  // written, so a review always points at the specific published version
  // it was actually about, even after the recipe is revised later.
  @Prop({ default: 0 })
  recipeRevision!: number
}

export const RatingSchema = SchemaFactory.createForClass(Rating)
RatingSchema.index({ userId: 1, recipeId: 1 }, { unique: true })
