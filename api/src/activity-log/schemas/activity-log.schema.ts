import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type ActivityLogDocument = ActivityLog & Document

@Schema({ timestamps: { createdAt: 'timestamp', updatedAt: false } })
export class ActivityLog {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true, index: true })
  action!: string

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog)
