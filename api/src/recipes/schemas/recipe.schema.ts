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

  // Ownership + publish workflow. Existing seeded recipes predate these
  // fields entirely - the schema defaults below make Mongoose fill them in
  // as "published, no owner" for any document that lacks them, so legacy
  // data keeps working as public/immutable without a migration script.
  @Prop({ index: true })
  ownerId?: string

  @Prop({ default: 'published', index: true })
  status!: 'draft' | 'pending_review' | 'published' | 'rejected'

  @Prop()
  reviewComment?: string

  @Prop({ default: 0 })
  currentRevision!: number

  // The revision number currently live to the public. Undefined means this
  // recipe has never been approved. Editing after publishing keeps advancing
  // currentRevision without touching this, so the public keeps seeing the
  // last-approved snapshot until a new edit is submitted and approved again.
  @Prop()
  publishedRevision?: number
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe)
