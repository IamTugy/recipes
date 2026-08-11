import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  clerkUserId!: string

  @Prop({ required: true })
  email!: string

  // Full name (first + last), not just first - anywhere this is shown to
  // other users should be unambiguous about whose recipe/review it is.
  @Prop()
  name?: string

  @Prop()
  imageUrl?: string

  // Explicit user choice, synced across devices - undefined means "no
  // preference set", in which case the client falls back to the browser's
  // language / the OS's prefers-color-scheme.
  @Prop()
  lang?: 'he' | 'en'

  @Prop()
  theme?: 'light' | 'dark' | 'system'
}

export const UserSchema = SchemaFactory.createForClass(User)
