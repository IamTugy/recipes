import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ReviewReplyDocument = ReviewReply & Document

@Schema({ timestamps: true })
export class ReviewReply {
  @Prop({ required: true, index: true })
  ratingId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string

  @Prop({ required: true })
  userId!: string

  @Prop({ required: true, maxlength: 500 })
  text!: string

  @Prop()
  mentionedUserId?: string

  @Prop()
  mentionedName?: string

  @Prop({ type: [String], default: [] })
  upvotes!: string[]
}

export const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply)
ReviewReplySchema.index({ ratingId: 1, createdAt: 1 })
