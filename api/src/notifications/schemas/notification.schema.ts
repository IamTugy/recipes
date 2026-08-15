import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

// Kept as a union (not a bare string) so adding a new trigger is a type
// error everywhere this needs updating, not a silent gap.
export type NotificationType = 'new_follower' | 'new_rating'

export type NotificationDocument = Notification & Document

@Schema({ timestamps: true })
export class Notification {
  // The recipient - whoever should see this notification.
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, enum: ['new_follower', 'new_rating'] })
  type!: NotificationType

  // Whoever triggered it (the new follower / the rater) - resolved to a
  // name/photo at read time via UsersService, not denormalized here.
  @Prop({ required: true })
  actorId!: string

  // Set only for recipe-scoped types (new_rating) - lets the frontend deep
  // link to the recipe itself rather than the actor's profile.
  @Prop()
  recipeId?: string

  @Prop({ default: false, index: true })
  read!: boolean
}

export const NotificationSchema = SchemaFactory.createForClass(Notification)
