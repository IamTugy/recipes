import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  clerkUserId!: string

  @Prop({ required: true })
  email!: string

  @Prop()
  name?: string
}

export const UserSchema = SchemaFactory.createForClass(User)
