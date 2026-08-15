import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

// 'new_follower' is the only type for now - kept as a union (not a bare
// string) so adding a second trigger later (e.g. 'new_review') is a type
// error everywhere this needs updating, not a silent gap.
export type NotificationType = 'new_follower'

export type NotificationDocument = Notification & Document

@Schema({ timestamps: true })
export class Notification {
  // The recipient - whoever should see this notification.
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, enum: ['new_follower'] })
  type!: NotificationType

  // Whoever triggered it (the new follower) - resolved to a name/photo at
  // read time via UsersService, not denormalized here.
  @Prop({ required: true })
  actorId!: string

  @Prop({ default: false, index: true })
  read!: boolean
}

export const NotificationSchema = SchemaFactory.createForClass(Notification)
