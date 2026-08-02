import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from './schemas/recipe.schema'
import { RecipeRevision, RecipeRevisionDocument } from './schemas/recipe-revision.schema'
import { Rating, RatingDocument } from '../ratings/schemas/rating.schema'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { CookLogService } from '../cook-log/cook-log.service'
import { UsersService } from '../users/users.service'
import { SaveRecipeDraftDto } from './dto/save-recipe-draft.dto'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

interface RatingAggregate {
  _id: string
  avg: number
  count: number
}

const RECIPE_FIELDS = [
  'title', 'titleHe', 'category', 'tags', 'tagsEn', 'cuisine', 'image', 'description',
  'descriptionEn', 'prepTime', 'cookTime', 'servings', 'difficulty', 'ingredients',
  'steps', 'tips', 'tipsEn', 'featured',
] as const

@Injectable()
export class RecipesService implements OnModuleInit {
  private readonly logger = new Logger(RecipesService.name)

  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(RecipeRevision.name) private readonly revisionModel: Model<RecipeRevisionDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
    private readonly activityLogService: ActivityLogService,
    private readonly cookLogService: CookLogService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  // One-time backfill: recipes seeded before the ownership/publish-workflow
  // fields existed have no `status` in Mongo at all. Mongoose's schema
  // `default` only applies when hydrating a document in-memory, never to a
  // raw query filter - so `find({ status: 'published' })` silently excluded
  // every legacy recipe from every listing. This runs on every boot but is
  // a no-op once the backfill has happened, since the filter matches zero
  // documents afterwards.
  async onModuleInit(): Promise<void> {
    const result = await this.recipeModel.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'published', currentRevision: 0 } },
    )
    if (result.modifiedCount > 0) {
      this.logger.log(`Backfilled status='published' on ${result.modifiedCount} legacy recipe(s)`)
    }
    await this.backfillLegacyOwnership()
    await this.backfillPublishedRevision()
  }

  // One-time backfill: recipes that were already status='published' before
  // publishedRevision existed (or before this specific recipe's ownership
  // backfill ran) have status='published' but no publishedRevision at all.
  // Public visibility now keys off publishedRevision, not status, so without
  // this they'd silently disappear from every listing despite still being
  // marked published.
  private async backfillPublishedRevision(): Promise<void> {
    const result = await this.recipeModel.updateMany(
      { status: 'published', publishedRevision: { $exists: false } },
      [{ $set: { publishedRevision: '$currentRevision' } }],
    )
    if (result.modifiedCount > 0) {
      this.logger.log(`Backfilled publishedRevision on ${result.modifiedCount} recipe(s) already marked published`)
    }
  }

  // One-time backfill: recipes seeded before ownership existed have no
  // `ownerId` at all. They belong to the site owner, so they should show up
  // under their "My Recipes" like anything else they authored. Only the
  // ones the owner already rated/reviewed are treated as vetted enough to
  // stay public; everything else becomes a private draft the owner can
  // review and submit for publishing like any other recipe.
  private async backfillLegacyOwnership(): Promise<void> {
    const ownerId = this.config.get<string>('OWNER_USER_ID')
    if (!ownerId) return

    const unowned = await this.recipeModel.find({ ownerId: { $exists: false } }).exec()
    if (unowned.length === 0) return

    const ratedSlugs = new Set<string>(
      await this.ratingModel.distinct('recipeSlug', { userId: ownerId }).exec(),
    )
    const unownedSlugs = unowned.map(r => r.slug)
    const publishedSlugs = unownedSlugs.filter(s => ratedSlugs.has(s))
    const draftSlugs = unownedSlugs.filter(s => !ratedSlugs.has(s))

    await this.recipeModel.updateMany({ slug: { $in: unownedSlugs } }, { $set: { ownerId } })

    if (draftSlugs.length > 0) {
      await this.recipeModel.updateMany(
        { slug: { $in: draftSlugs } },
        { $set: { status: 'draft', currentRevision: 0 } },
      )
    }

    if (publishedSlugs.length > 0) {
      await this.recipeModel.updateMany(
        { slug: { $in: publishedSlugs } },
        { $set: { status: 'published', currentRevision: 1, publishedRevision: 1 } },
      )
      for (const recipe of unowned) {
        if (!publishedSlugs.includes(recipe.slug)) continue
        const alreadyHasRevision = await this.revisionModel.exists({ recipeSlug: recipe.slug, revisionNumber: 1 })
        if (alreadyHasRevision) continue
        const snapshot: Record<string, unknown> = {}
        for (const field of RECIPE_FIELDS) snapshot[field] = recipe[field]
        await this.revisionModel.create({ recipeSlug: recipe.slug, revisionNumber: 1, authorId: ownerId, snapshot, published: true })
      }
    }

    this.logger.log(
      `Backfilled ownership on ${unownedSlugs.length} legacy recipe(s): ${publishedSlugs.length} published, ${draftSlugs.length} draft`,
    )
  }

  private async ratingsBySlug(slugs: string[]): Promise<Map<string, { avg: number; count: number }>> {
    const aggregates = (await this.ratingModel.aggregate([
      { $match: { recipeSlug: { $in: slugs } } },
      { $group: { _id: '$recipeSlug', avg: { $avg: '$score' }, count: { $sum: 1 } } },
    ])) as RatingAggregate[]

    return new Map(aggregates.map(a => [a._id, { avg: a.avg, count: a.count }]))
  }

  private async attachRatingsAndViews<T extends { slug: string; ownerId?: string }>(
    recipes: T[],
    ratings: Map<string, { avg: number; count: number }>,
    views: Map<string, number>,
    cooks: Map<string, number>,
  ) {
    const ownerIds = [...new Set(recipes.map(r => r.ownerId).filter((v): v is string => !!v))]
    const names = await this.usersService.namesByIds(ownerIds)
    return recipes.map(recipe => {
      const rating = ratings.get(recipe.slug)
      return {
        ...recipe,
        averageRating: rating ? Math.round(rating.avg * 10) / 10 : null,
        ratingCount: rating?.count ?? 0,
        viewCount: views.get(recipe.slug) ?? 0,
        cookCount: cooks.get(recipe.slug) ?? 0,
        ownerName: recipe.ownerId ? names[recipe.ownerId] ?? null : null,
      }
    })
  }

  // The public should only ever see the last-approved snapshot of a recipe's
  // content, never whatever the owner currently has mid-edit in the live
  // document. Overlays the recipe fields from its `publishedRevision`
  // snapshot on top of the live doc (which still supplies slug/status/
  // ownerId/timestamps etc).
  private async overlayPublishedSnapshot(recipe: RecipeDocument): Promise<Record<string, unknown> & { slug: string }> {
    const plain = recipe.toObject()
    if (recipe.publishedRevision == null) return plain
    const revision = await this.revisionModel
      .findOne({ recipeSlug: recipe.slug, revisionNumber: recipe.publishedRevision })
      .lean()
      .exec()
    if (!revision) return plain
    return { ...plain, ...revision.snapshot }
  }

  async findAll() {
    const recipes = await this.recipeModel.find({ hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    const plain = await Promise.all(recipes.map(r => this.overlayPublishedSnapshot(r)))
    const slugs = plain.map(r => r.slug as string)
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsBySlug(slugs),
      this.activityLogService.viewCountsBySlug(slugs),
      this.cookLogService.countsBySlug(slugs),
    ])
    return this.attachRatingsAndViews(plain, ratings, views, cooks)
  }

  async findPublishedByOwner(ownerId: string) {
    const recipes = await this.recipeModel.find({ ownerId, hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    const plain = await Promise.all(recipes.map(r => this.overlayPublishedSnapshot(r)))
    const slugs = plain.map(r => r.slug as string)
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsBySlug(slugs),
      this.activityLogService.viewCountsBySlug(slugs),
      this.cookLogService.countsBySlug(slugs),
    ])
    return this.attachRatingsAndViews(plain, ratings, views, cooks)
  }

  async findBySlug(slug: string) {
    const recipe = await this.recipeModel.findOne({ slug, hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    if (!recipe) return null
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsBySlug([slug]),
      this.activityLogService.viewCountsBySlug([slug]),
      this.cookLogService.countsBySlug([slug]),
    ])
    const plain = await this.overlayPublishedSnapshot(recipe)
    return (await this.attachRatingsAndViews([plain], ratings, views, cooks))[0]
  }

  // Bypasses the published-only filter for the owner previewing their own
  // draft/pending/rejected recipe, or an admin checking anything - either
  // one sees their live in-progress content. Anyone else viewing a recipe
  // that has ever been published sees the pinned public snapshot instead.
  async findBySlugForUser(slug: string, userId: string, isAdmin: boolean) {
    const recipe = await this.recipeModel.findOne({ slug }).exec()
    if (!recipe) return null
    const isOwnerOrAdmin = isAdmin || recipe.ownerId === userId
    if (recipe.publishedRevision == null && !isOwnerOrAdmin) return null

    if (recipe.publishedRevision != null) {
      const base = isOwnerOrAdmin ? recipe.toObject() : await this.overlayPublishedSnapshot(recipe)
      const [ratings, views, cooks] = await Promise.all([
        this.ratingsBySlug([slug]),
        this.activityLogService.viewCountsBySlug([slug]),
        this.cookLogService.countsBySlug([slug]),
      ])
      return (await this.attachRatingsAndViews([base], ratings, views, cooks))[0]
    }
    const ownerName = recipe.ownerId ? (await this.usersService.namesByIds([recipe.ownerId]))[recipe.ownerId] ?? null : null
    return { ...recipe.toObject(), averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0, ownerName }
  }

  async findMine(userId: string) {
    const recipes = await this.recipeModel.find({ ownerId: userId }).sort({ updatedAt: -1 }).exec()
    return recipes.map(r => r.toObject())
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'recipe'
    let candidate = base
    let suffix = 2
    while (await this.recipeModel.exists({ slug: candidate })) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  private async saveNewRevision(recipe: RecipeDocument, authorId: string): Promise<void> {
    const snapshot: Record<string, unknown> = {}
    for (const field of RECIPE_FIELDS) snapshot[field] = recipe[field]
    await this.revisionModel.create({
      recipeSlug: recipe.slug,
      revisionNumber: recipe.currentRevision,
      authorId,
      snapshot,
    })
  }

  async createDraft(userId: string, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const slug = await this.generateUniqueSlug(dto.title)
    const recipe = await this.recipeModel.create({ ...dto, slug, ownerId: userId, status: 'draft', currentRevision: 1 })
    await this.saveNewRevision(recipe, userId)
    return recipe
  }

  private async getEditableOrThrow(slug: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findOne({ slug }).exec()
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' not found`)
    if (recipe.ownerId && recipe.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the owner or an admin can edit this recipe')
    }
    if (recipe.status === 'pending_review') {
      throw new BadRequestException('This recipe is locked while its publish request is pending review')
    }
    return recipe
  }

  async updateDraft(slug: string, userId: string, isAdmin: boolean, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(slug, userId, isAdmin)
    recipe.set(dto)
    recipe.currentRevision += 1
    await recipe.save()
    await this.saveNewRevision(recipe, userId)
    return recipe
  }

  async submitForReview(slug: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(slug, userId, isAdmin)
    const missing = this.missingRequiredFields(recipe)
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot submit for review, missing/invalid: ${missing.join(', ')}`)
    }
    recipe.status = 'pending_review'
    recipe.reviewComment = undefined
    await recipe.save()
    return recipe
  }

  private missingRequiredFields(recipe: RecipeDocument): string[] {
    const missing: string[] = []
    if (!recipe.title?.trim()) missing.push('title')
    if (!recipe.category) missing.push('category')
    if (!recipe.description?.trim()) missing.push('description')
    if (!recipe.image?.trim() || !recipe.image.includes('assets.tugy.dev')) missing.push('image (must be an uploaded photo)')
    if (!recipe.prepTime && recipe.prepTime !== 0) missing.push('prepTime')
    if (!recipe.cookTime && recipe.cookTime !== 0) missing.push('cookTime')
    if (!recipe.servings) missing.push('servings')
    if (!recipe.difficulty) missing.push('difficulty')
    if (!recipe.ingredients || (recipe.ingredients as unknown[]).length === 0) missing.push('ingredients')
    if (!recipe.steps || (recipe.steps as unknown[]).length === 0) missing.push('steps')
    return missing
  }

  async cancelSubmission(slug: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findOne({ slug }).exec()
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' not found`)
    if (recipe.ownerId !== userId && !isAdmin) throw new ForbiddenException('Only the owner or an admin can cancel this submission')
    if (recipe.status !== 'pending_review') throw new BadRequestException('This recipe is not pending review')
    recipe.status = recipe.publishedRevision != null ? 'published' : 'draft'
    await recipe.save()
    return recipe
  }

  async listPendingSubmissions() {
    const recipes = await this.recipeModel.find({ status: 'pending_review' }).sort({ updatedAt: 1 }).exec()
    return recipes.map(r => r.toObject())
  }

  async approveSubmission(slug: string, adminId: string): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findOne({ slug }).exec()
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' not found`)
    if (recipe.status !== 'pending_review') throw new BadRequestException('This recipe is not pending review')

    await this.revisionModel.updateOne(
      { recipeSlug: slug, revisionNumber: recipe.currentRevision },
      { $set: { published: true } },
    )

    recipe.publishedRevision = recipe.currentRevision
    recipe.status = 'published'
    recipe.reviewComment = undefined
    await recipe.save()
    return recipe
  }

  async rejectSubmission(slug: string, comment: string): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findOne({ slug }).exec()
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' not found`)
    if (recipe.status !== 'pending_review') throw new BadRequestException('This recipe is not pending review')
    recipe.status = 'rejected'
    recipe.reviewComment = comment
    await recipe.save()
    return recipe
  }

  // The recipe's history is its published trajectory - only ever-approved
  // revisions show up here, for anyone, including the owner. Drafts in
  // progress are visible directly on the recipe (findBySlugForUser), not
  // through this list.
  async listRevisions(slug: string) {
    const revisions = await this.revisionModel.find({ recipeSlug: slug, published: true }).sort({ revisionNumber: -1 }).lean().exec()
    return revisions.map(r => ({
      revisionNumber: r.revisionNumber,
      authorId: r.authorId,
      snapshot: r.snapshot,
      published: r.published,
      publishedAt: (r as unknown as { createdAt: Date }).createdAt,
    }))
  }

  async remove(slug: string, userId: string, isAdmin: boolean): Promise<void> {
    const recipe = await this.recipeModel.findOne({ slug }).exec()
    if (!recipe) return
    if (recipe.publishedRevision != null) {
      if (!isAdmin) throw new ForbiddenException('Only an admin can delete a published recipe')
    } else if (recipe.ownerId && recipe.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the owner or an admin can delete this recipe')
    }
    await this.recipeModel.deleteOne({ slug }).exec()
  }
}
