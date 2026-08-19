import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TimerDocument = Timer & Document

@Schema({ timestamps: true })
export class Timer {
  @Prop({ required: true, index: true })
  userId!: string

  // The frontend's own timer id (e.g. "timer-5") - used as the join key
  // for create/delete instead of Mongo's own _id, so the client never
  // needs to learn a server-generated id just to cancel a timer it
  // already knows the id of.
  @Prop({ required: true })
  clientId!: string

  @Prop({ required: true })
  recipeId!: string

  @Prop({ required: true })
  label!: string

  // Epoch ms this timer reaches zero - mirrors TimerState.endsAt on the
  // frontend (src/types.ts).
  @Prop({ required: true })
  endsAt!: number

  @Prop({ default: false })
  pushSent!: boolean
}

export const TimerSchema = SchemaFactory.createForClass(Timer)

// One row per (user, client timer) - upsert() on this key so a resumed
// timer (same clientId, new endsAt) replaces its own row instead of
// colliding with a stale one that failed to get deleted on pause.
TimerSchema.index({ userId: 1, clientId: 1 }, { unique: true })
