import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type RecipeRevisionDocument = RecipeRevision & Document

// One immutable snapshot per approved publish. Ratings/notes record the
// revision number that was live when they were written, so a review always
// points at the specific version of the recipe it was actually about.
@Schema({ timestamps: true })
export class RecipeRevision {
  @Prop({ required: true, index: true })
  recipeSlug!: string

  @Prop({ required: true })
  revisionNumber!: number

  @Prop({ required: true })
  authorId!: string

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot!: Record<string, unknown>
}

export const RecipeRevisionSchema = SchemaFactory.createForClass(RecipeRevision)
RecipeRevisionSchema.index({ recipeSlug: 1, revisionNumber: 1 }, { unique: true })
