import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type RecipeRevisionDocument = RecipeRevision & Document

// One immutable snapshot per saved edit (draft or published). Ratings/notes
// record the revision number that was publicly live when they were written,
// so a review always points at the specific version of the recipe it was
// actually about. `published` marks the subset of revisions that were ever
// approved and shown to the public - browsing a published recipe's history
// as a random visitor only sees those, while the owner/admin can browse
// every saved revision including drafts still in progress.
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

  @Prop({ default: false })
  published!: boolean
}

export const RecipeRevisionSchema = SchemaFactory.createForClass(RecipeRevision)
RecipeRevisionSchema.index({ recipeSlug: 1, revisionNumber: 1 }, { unique: true })
