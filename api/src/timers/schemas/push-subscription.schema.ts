import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type PushSubscriptionDocument = PushSubscription & Document

@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ required: true, index: true })
  userId!: string

  // Uniquely identifies this browser/device's subscription - the same
  // endpoint reappears if the same device subscribes again, which is what
  // makes the upsert-by-endpoint in PushService.subscribe() idempotent.
  @Prop({ required: true, unique: true })
  endpoint!: string

  @Prop({ required: true, type: { p256dh: String, auth: String } })
  keys!: { p256dh: string; auth: string }

  @Prop()
  deviceLabel?: string
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription)
