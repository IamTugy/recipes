import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type RecipeDocument = Recipe & Document

@Schema({ timestamps: true })
export class Recipe {
  @Prop({ required: true, unique: true, index: true })
  slug!: string

  @Prop({ required: true })
  title!: string

  @Prop()
  titleHe?: string

  @Prop({ required: true })
  category!: string

  @Prop({ type: [String], default: [] })
  tags!: string[]

  @Prop({ type: [String] })
  tagsEn?: string[]

  @Prop()
  cuisine?: string

  @Prop({ required: true })
  image!: string

  @Prop({ required: true })
  description!: string

  @Prop()
  descriptionEn?: string

  @Prop({ required: true })
  prepTime!: number

  @Prop({ required: true })
  cookTime!: number

  @Prop({ required: true })
  servings!: number

  @Prop({ required: true })
  difficulty!: string

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  ingredients!: unknown[]

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  steps!: unknown[]

  @Prop()
  source?: string

  @Prop({ default: false })
  featured?: boolean

  @Prop({ default: false })
  hidden?: boolean

  @Prop({ type: [String] })
  tips?: string[]

  @Prop({ type: [String] })
  tipsEn?: string[]
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe)
