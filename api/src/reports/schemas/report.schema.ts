import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ReportReason = 'inappropriate' | 'incorrect' | 'spam' | 'copyright' | 'other'

export type ReportDocument = Report & Document

@Schema({ timestamps: true })
export class Report {
  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true, index: true })
  reporterId!: string

  @Prop({ required: true, enum: ['inappropriate', 'incorrect', 'spam', 'copyright', 'other'] })
  reason!: ReportReason

  @Prop()
  message?: string

  // Admin-only triage flag - a report stays visible in the list either way,
  // this just lets the owner mark it as "already looked at" without
  // deleting the record.
  @Prop({ default: false })
  resolved!: boolean
}

export const ReportSchema = SchemaFactory.createForClass(Report)
ReportSchema.index({ recipeId: 1, reporterId: 1 }, { unique: true })
