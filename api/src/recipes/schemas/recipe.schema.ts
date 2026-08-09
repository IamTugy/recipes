import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type RecipeDocument = Recipe & Document

// virtuals: true is required for the "id" virtual (Mongoose's default
// _id.toHexString() getter) to actually appear in .toObject()/.toJSON()
// output - without it, every API response built from those was silently
// missing the field the frontend routes/links to (sends /recipes/undefined).
@Schema({ timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } })
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

  // Kosher-style classification: 'dairy' means contains dairy and no meat/
  // poultry/fish of any kind; 'meat' means contains any meat/poultry/fish;
  // 'parve' means neither. Optional - never blocks submission. Set by AI at
  // creation/import time, owner-editable, re-checked (not enforced) by the
  // quality review for a mismatch against the actual ingredients.
  @Prop()
  kosherType?: 'meat' | 'dairy' | 'parve'

  // Per-100g estimate, typically produced by the AI nutrition-estimate
  // endpoint from the ingredient list - never independently validated
  // against the ingredients, so treat it as an approximation, not a fact.
  @Prop({ type: MongooseSchema.Types.Mixed })
  nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number; servingWeight?: number }

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  ingredients!: unknown[]

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  steps!: unknown[]

  @Prop()
  source?: string

  // Set when this recipe (or its current draft content) was produced by the
  // AI-research feature rather than typed/imported by a human. Once true it
  // is never allowed back to false or edited away - see
  // RecipesService.updateDraft - so the "AI generated" badge stays a
  // trustworthy signal of provenance.
  @Prop({ default: false })
  aiGenerated?: boolean

  // Citations for where the AI found the recipe it generated. Shown as a
  // read-only "Sources" section for AI recipes; for regular recipes the
  // same field is a normal editable field (hidden in view mode when empty).
  @Prop({ type: [{ title: String, url: String }], default: [] })
  sources?: { title: string; url: string }[]

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
