import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type FollowDocument = Follow & Document

@Schema({ timestamps: true })
export class Follow {
  @Prop({ required: true, index: true })
  followerId!: string

  @Prop({ required: true, index: true })
  followingId!: string
}

export const FollowSchema = SchemaFactory.createForClass(Follow)
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true })
