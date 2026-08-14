import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CookSessionDocument = CookSession & Document

@Schema({ _id: false })
export class CookSessionStep {
  @Prop({ required: true })
  stepKey!: string

  @Prop({ required: true })
  stepNum!: number

  @Prop({ required: true })
  enteredAt!: Date

  @Prop({ required: true })
  durationSeconds!: number
}

export const CookSessionStepSchema = SchemaFactory.createForClass(CookSessionStep)

@Schema({ timestamps: true })
export class CookSession {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true })
  startedAt!: Date

  @Prop({ required: true })
  finishedAt!: Date

  @Prop({ required: true })
  totalDurationSeconds!: number

  @Prop({ type: [CookSessionStepSchema], required: true })
  steps!: CookSessionStep[]
}

export const CookSessionSchema = SchemaFactory.createForClass(CookSession)
