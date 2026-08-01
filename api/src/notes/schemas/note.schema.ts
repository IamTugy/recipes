import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type NoteDocument = Note & Document

@Schema({ timestamps: true })
export class Note {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string

  @Prop({ required: true })
  text!: string
}

export const NoteSchema = SchemaFactory.createForClass(Note)
NoteSchema.index({ userId: 1, recipeSlug: 1 }, { unique: true })
