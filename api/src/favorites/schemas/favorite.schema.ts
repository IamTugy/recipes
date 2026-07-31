import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type FavoriteDocument = Favorite & Document

@Schema({ timestamps: true })
export class Favorite {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite)
FavoriteSchema.index({ userId: 1, recipeSlug: 1 }, { unique: true })
