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
import { RecipeQualityService } from './quality/recipe-quality.service'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

// Recipes are looked up by their Mongo _id everywhere now (URLs, sharing,
// every cross-collection reference) instead of the title-derived slug, so
// two recipes can share a title and a share link never breaks on non-ASCII
// characters. A malformed id (e.g. an old slug-based link, or a crawler
// probing garbage) must behave like "not found", not throw a 500.
function isCastError(err: unknown): boolean {
  return err instanceof Error && err.name === 'CastError'
}

// Drops sources whose URL exactly repeats an earlier one (trimmed,
// case-insensitive) - a client or the AI import/generate flow occasionally
// cites the same page twice, and the "Sources" section shouldn't show a
// duplicate link.
function dedupeSources(sources?: { title: string; url: string }[]): { title: string; url: string }[] | undefined {
  if (!sources) return sources
  const seen = new Set<string>()
  return sources.filter(s => {
    const key = s.url.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

interface RatingAggregate {
  _id: string
  avg: number
  count: number
}

const RECIPE_FIELDS = [
  'title', 'titleHe', 'category', 'tags', 'tagsEn', 'cuisine', 'image', 'description',
  'descriptionEn', 'prepTime', 'cookTime', 'servings', 'difficulty', 'ingredients',
  'steps', 'tips', 'tipsEn', 'aiGenerated', 'sources',
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
    private readonly qualityService: RecipeQualityService,
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

    const ratedIds = new Set<string>(
      await this.ratingModel.distinct('recipeId', { userId: ownerId }).exec(),
    )
    const unownedIds = unowned.map(r => r.id as string)
    const publishedIds = unownedIds.filter(id => ratedIds.has(id))
    const draftIds = unownedIds.filter(id => !ratedIds.has(id))

    await this.recipeModel.updateMany({ _id: { $in: unownedIds } }, { $set: { ownerId } })

    if (draftIds.length > 0) {
      await this.recipeModel.updateMany(
        { _id: { $in: draftIds } },
        { $set: { status: 'draft', currentRevision: 0 } },
      )
    }

    if (publishedIds.length > 0) {
      await this.recipeModel.updateMany(
        { _id: { $in: publishedIds } },
        { $set: { status: 'published', currentRevision: 1, publishedRevision: 1 } },
      )
      for (const recipe of unowned) {
        if (!publishedIds.includes(recipe.id as string)) continue
        const alreadyHasRevision = await this.revisionModel.exists({ recipeId: recipe.id, revisionNumber: 1 })
        if (alreadyHasRevision) continue
        const snapshot: Record<string, unknown> = {}
        for (const field of RECIPE_FIELDS) snapshot[field] = recipe[field]
        await this.revisionModel.create({ recipeId: recipe.id, revisionNumber: 1, authorId: ownerId, snapshot, published: true })
      }
    }

    this.logger.log(
      `Backfilled ownership on ${unownedIds.length} legacy recipe(s): ${publishedIds.length} published, ${draftIds.length} draft`,
    )
  }

  private async ratingsById(ids: string[]): Promise<Map<string, { avg: number; count: number }>> {
    const aggregates = (await this.ratingModel.aggregate([
      { $match: { recipeId: { $in: ids } } },
      { $group: { _id: '$recipeId', avg: { $avg: '$score' }, count: { $sum: 1 } } },
    ])) as RatingAggregate[]

    return new Map(aggregates.map(a => [a._id, { avg: a.avg, count: a.count }]))
  }

  private async attachRatingsAndViews<T extends { id: string; ownerId?: string }>(
    recipes: T[],
    ratings: Map<string, { avg: number; count: number }>,
    views: Map<string, number>,
    cooks: Map<string, number>,
  ) {
    const ownerIds = [...new Set(recipes.map(r => r.ownerId).filter((v): v is string => !!v))]
    const names = await this.usersService.namesByIds(ownerIds)
    return recipes.map(recipe => {
      const rating = ratings.get(recipe.id)
      return {
        ...recipe,
        averageRating: rating ? Math.round(rating.avg * 10) / 10 : null,
        ratingCount: rating?.count ?? 0,
        viewCount: views.get(recipe.id) ?? 0,
        cookCount: cooks.get(recipe.id) ?? 0,
        ownerName: recipe.ownerId ? names[recipe.ownerId] ?? null : null,
      }
    })
  }

  // The public should only ever see the last-approved snapshot of a recipe's
  // content, never whatever the owner currently has mid-edit in the live
  // document. Overlays the recipe fields from its `publishedRevision`
  // snapshot on top of the live doc (which still supplies slug/status/
  // ownerId/timestamps etc).
  private async overlayPublishedSnapshot(recipe: RecipeDocument): Promise<Record<string, unknown> & { id: string }> {
    const plain = recipe.toObject()
    if (recipe.publishedRevision == null) return plain
    const revision = await this.revisionModel
      .findOne({ recipeId: recipe.id, revisionNumber: recipe.publishedRevision })
      .lean()
      .exec()
    if (!revision) return plain
    return { ...plain, ...revision.snapshot }
  }

  async findAll() {
    const recipes = await this.recipeModel.find({ hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    const plain = await Promise.all(recipes.map(r => this.overlayPublishedSnapshot(r)))
    const ids = plain.map(r => r.id)
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsById(ids),
      this.activityLogService.viewCountsById(ids),
      this.cookLogService.countsById(ids),
    ])
    return this.attachRatingsAndViews(plain, ratings, views, cooks)
  }

  async findPublishedByOwner(ownerId: string) {
    const recipes = await this.recipeModel.find({ ownerId, hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    const plain = await Promise.all(recipes.map(r => this.overlayPublishedSnapshot(r)))
    const ids = plain.map(r => r.id)
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsById(ids),
      this.activityLogService.viewCountsById(ids),
      this.cookLogService.countsById(ids),
    ])
    return this.attachRatingsAndViews(plain, ratings, views, cooks)
  }

  async findById(id: string) {
    let recipe: RecipeDocument | null
    try {
      recipe = await this.recipeModel.findOne({ _id: id, hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    } catch (err) {
      if (isCastError(err)) return null
      throw err
    }
    if (!recipe) return null
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsById([recipe.id]),
      this.activityLogService.viewCountsById([recipe.id]),
      this.cookLogService.countsById([recipe.id]),
    ])
    const plain = await this.overlayPublishedSnapshot(recipe)
    return (await this.attachRatingsAndViews([plain], ratings, views, cooks))[0]
  }

  // Bypasses the published-only filter for the owner previewing their own
  // draft/pending/rejected recipe, or an admin checking anything - either
  // one sees their live in-progress content. Anyone else viewing a recipe
  // that has ever been published sees the pinned public snapshot instead.
  async findByIdForUser(id: string, userId: string, isAdmin: boolean) {
    let recipe: RecipeDocument | null
    try {
      recipe = await this.recipeModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec()
    } catch (err) {
      if (isCastError(err)) return null
      throw err
    }
    if (!recipe) return null
    const isOwnerOrAdmin = isAdmin || recipe.ownerId === userId
    if (recipe.publishedRevision == null && !isOwnerOrAdmin) return null

    if (recipe.publishedRevision != null) {
      const base = isOwnerOrAdmin ? { ...recipe.toObject(), id: recipe.id } : await this.overlayPublishedSnapshot(recipe)
      const [ratings, views, cooks] = await Promise.all([
        this.ratingsById([recipe.id]),
        this.activityLogService.viewCountsById([recipe.id]),
        this.cookLogService.countsById([recipe.id]),
      ])
      return (await this.attachRatingsAndViews([base], ratings, views, cooks))[0]
    }
    const ownerName = recipe.ownerId ? (await this.usersService.namesByIds([recipe.ownerId]))[recipe.ownerId] ?? null : null
    return { ...recipe.toObject(), averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0, ownerName }
  }

  async findMine(userId: string) {
    const recipes = await this.recipeModel.find({ ownerId: userId, deletedAt: { $exists: false } }).sort({ updatedAt: -1 }).exec()
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
      recipeId: recipe.id,
      revisionNumber: recipe.currentRevision,
      authorId,
      snapshot,
    })
  }

  async createDraft(userId: string, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const slug = await this.generateUniqueSlug(dto.title)
    const recipe = await this.recipeModel.create({
      ...dto, sources: dedupeSources(dto.sources), slug, ownerId: userId, status: 'draft', currentRevision: 1,
    })
    await this.saveNewRevision(recipe, userId)
    return recipe
  }

  private async getEditableOrThrow(id: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    let recipe: RecipeDocument | null
    try {
      recipe = await this.recipeModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec()
    } catch (err) {
      if (isCastError(err)) throw new NotFoundException(`Recipe '${id}' not found`)
      throw err
    }
    if (!recipe) throw new NotFoundException(`Recipe '${id}' not found`)
    if (recipe.ownerId && recipe.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the owner or an admin can edit this recipe')
    }
    if (recipe.status === 'pending_review') {
      throw new BadRequestException('This recipe is locked while its publish request is pending review')
    }
    return recipe
  }

  // Uses an atomic $inc for currentRevision rather than read-modify-write,
  // so two concurrent saves (e.g. a double-click, or a photo upload
  // followed immediately by Save) each get their own distinct revision
  // number instead of racing to increment the same stale value - which
  // previously could leave the live document's fields out of sync with
  // whichever revision number ended up stored on it.
  async updateDraft(id: string, userId: string, isAdmin: boolean, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    // Editing a rejected recipe means the owner is addressing the feedback -
    // clear the rejected state so it isn't stuck showing "rejected" forever.
    const wasRejected = recipe.status === 'rejected'
    // The "AI generated" tag and its sources are immutable once set - a
    // recipe can never have its AI provenance edited or removed, no matter
    // what the request body contains.
    const aiLock = recipe.aiGenerated ? { aiGenerated: true, sources: recipe.sources } : {}
    const update: Record<string, unknown> = {
      $set: { ...dto, sources: dedupeSources(dto.sources), ...aiLock, ...(wasRejected ? { status: 'draft' } : {}) },
      $inc: { currentRevision: 1 },
    }
    if (wasRejected) update.$unset = { reviewComment: '' }
    const updated = await this.recipeModel.findOneAndUpdate({ _id: id }, update, { new: true }).exec()
    if (!updated) throw new NotFoundException(`Recipe '${id}' not found`)
    await this.saveNewRevision(updated, userId)
    return updated
  }

  // Score threshold an AI review must meet to publish. Below this, the
  // recipe is rejected with the review's findings instead.
  private static readonly PUBLISH_THRESHOLD = 95

  async submitForReview(id: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    const missing = this.missingRequiredFields(recipe)
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot submit for review, missing/invalid: ${missing.join(', ')}`)
    }

    const review = await this.qualityService.review(recipe.toObject())

    if (review.score >= RecipesService.PUBLISH_THRESHOLD) {
      await this.revisionModel.updateOne(
        { recipeId: id, revisionNumber: recipe.currentRevision },
        { $set: { published: true } },
      )
      recipe.publishedRevision = recipe.currentRevision
      recipe.status = 'published'
      recipe.reviewComment = undefined
    } else {
      recipe.status = 'rejected'
      recipe.reviewComment = undefined
    }
    recipe.qualityReview = review
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

    // Unit is deliberately not required here - it's genuinely optional for
    // countable items ("1 garlic clove", "10 grapes"), so this can't be a
    // hard deterministic rule. Whether a missing unit is actually a problem
    // ("1 milk" is ambiguous, "1 clove" isn't) is a judgment call left to
    // the AI quality review instead.
    const ingredientGroups = (recipe.ingredients ?? []) as { items?: { name?: string }[] }[]
    if (ingredientGroups.length === 0) {
      missing.push('ingredients')
    } else {
      const hasIncompleteItem = ingredientGroups.some(g =>
        !g.items || g.items.length === 0 || g.items.some(item => !item.name?.trim())
      )
      if (hasIncompleteItem) missing.push('ingredients (every item needs a name)')
    }

    const stepGroups = (recipe.steps ?? []) as { items?: { instruction?: string }[] }[]
    if (stepGroups.length === 0) {
      missing.push('steps')
    } else {
      const hasIncompleteStep = stepGroups.some(g => !g.items || !g.items.some(item => item.instruction?.trim()))
      if (hasIncompleteStep) missing.push('steps (every section needs at least one instruction)')
    }

    return missing
  }

  // Recent AI review outcomes across every user's recipes - the public
  // "in progress" feed. Anything that's ever been through the AI gate has
  // qualityReview set, whether it ended up published or rejected.
  async listRecentSubmissions(limit = 50) {
    const recipes = await this.recipeModel
      .find({ qualityReview: { $exists: true } })
      .sort({ 'qualityReview.checkedAt': -1 })
      .limit(limit)
      .exec()
    return recipes.map(r => r.toObject())
  }

  async canViewDraftRevisions(id: string, userId: string, isAdmin: boolean): Promise<boolean> {
    if (isAdmin) return true
    try {
      const recipe = await this.recipeModel.findOne({ _id: id }).select('ownerId').lean().exec()
      return !!recipe && recipe.ownerId === userId
    } catch (err) {
      if (isCastError(err)) return false
      throw err
    }
  }

  // A random visitor only ever sees the recipe's published trajectory. The
  // owner/admin also sees their own drafts-in-progress here, so an edit
  // that hasn't been submitted/approved yet still shows up as the latest
  // entry instead of silently missing from the list.
  async listRevisions(id: string, includeDrafts: boolean) {
    const filter: Record<string, unknown> = { recipeId: id }
    if (!includeDrafts) filter.published = true
    const revisions = await this.revisionModel.find(filter).sort({ revisionNumber: -1 }).lean().exec()
    return revisions.map(r => ({
      id: String(r._id),
      revisionNumber: r.revisionNumber,
      authorId: r.authorId,
      snapshot: r.snapshot,
      published: r.published,
      publishedAt: (r as unknown as { createdAt: Date }).createdAt,
    }))
  }

  // Never a hard delete: a recipe that has ever been published cannot be
  // deleted at all (by anyone, including admins - once it's been public,
  // it stays recoverable by design), and everything else is soft-deleted
  // (deletedAt set) rather than removed from the database, so a mistaken
  // delete is always reversible by clearing that field.
  async remove(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const recipe = await this.recipeModel.findOne({ _id: id }).exec()
    if (!recipe) return
    if (recipe.publishedRevision != null) {
      throw new ForbiddenException('A recipe that has ever been published can never be deleted')
    }
    if (recipe.status === 'pending_review') {
      throw new BadRequestException('This recipe is locked while its publish request is pending review')
    }
    if (recipe.ownerId && recipe.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the owner or an admin can delete this recipe')
    }
    recipe.deletedAt = new Date()
    await recipe.save()
  }
}
