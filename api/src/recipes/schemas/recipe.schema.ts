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

  // Everything below is required to *submit* a recipe for review
  // (enforced in RecipesService.missingRequiredFields), but a draft can be
  // saved with just a title - none of it is required at the schema level.
  @Prop()
  category?: string

  @Prop({ type: [String], default: [] })
  tags!: string[]

  @Prop({ type: [String] })
  tagsEn?: string[]

  @Prop()
  cuisine?: string

  @Prop()
  image?: string

  @Prop()
  description?: string

  @Prop()
  descriptionEn?: string

  @Prop()
  prepTime?: number

  @Prop()
  cookTime?: number

  @Prop()
  servings?: number

  @Prop()
  difficulty?: string

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  ingredients!: unknown[]

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
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

  // Soft-delete marker. Recipes are never hard-deleted - a "deleted" recipe
  // just gets this timestamp set and disappears from every listing/lookup,
  // while its document and full revision history stay in the database and
  // can be restored by clearing this field.
  @Prop({ index: true })
  deletedAt?: Date
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe)
