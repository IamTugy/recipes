import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CollectionDocument = Collection & Document

@Schema({ timestamps: true })
export class Collection {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, maxlength: 60 })
  name!: string

  @Prop({ type: [String], default: [] })
  recipeIds!: string[]
}

export const CollectionSchema = SchemaFactory.createForClass(Collection)
