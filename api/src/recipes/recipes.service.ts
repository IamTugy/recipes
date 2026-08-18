import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
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
import { RecipeSimilarityService, SimilaritySourceRecipe } from './similarity/recipe-similarity.service'
import { RecipeGroupingService } from './grouping/recipe-grouping.service'

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

// Drops sources that repeat an earlier one. Dedupe by title, not URL - the
// AI-research flow's search grounding gives each citation of the same
// source its own unique Vertex AI redirect URL, so two citations of the
// same page have different URLs but identical titles (see
// GeminiService.generateWithSearch, which applies the same rule to its own
// output - this catches sources that made it past that first dedup pass,
// e.g. from re-running research or merging citations another way). Falls
// back to the URL when the title is empty.
function dedupeSources(sources?: { title: string; url: string }[]): { title: string; url: string }[] | undefined {
  if (!sources) return sources
  const seen = new Set<string>()
  return sources.filter(s => {
    const key = (s.title.trim() || s.url.trim()).toLowerCase()
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
    private readonly similarityService: RecipeSimilarityService,
    private readonly groupingService: RecipeGroupingService,
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
    userCooks?: Map<string, number>,
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
        ...(userCooks ? { userCookCount: userCooks.get(recipe.id) ?? 0 } : {}),
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

  // Batched form of overlayPublishedSnapshot - one query for every recipe's
  // published-revision snapshot instead of one findOne per recipe. Every
  // list-returning endpoint (findAll/findPublishedByOwner(s)) was previously
  // doing N sequential-round-trip lookups via Promise.all(recipes.map(...)),
  // which parallelizes the wait but still costs N real queries - this costs
  // exactly one, regardless of list size.
  private async overlayPublishedSnapshots(recipes: RecipeDocument[]): Promise<(Record<string, unknown> & { id: string })[]> {
    const needRevision = recipes.filter(r => r.publishedRevision != null)
    if (needRevision.length === 0) return recipes.map(r => r.toObject())

    const revisions = await this.revisionModel
      .find({ $or: needRevision.map(r => ({ recipeId: r.id, revisionNumber: r.publishedRevision })) })
      .lean()
      .exec()
    const byKey = new Map(revisions.map(rev => [`${rev.recipeId}:${rev.revisionNumber}`, rev]))

    return recipes.map(recipe => {
      const plain = recipe.toObject()
      if (recipe.publishedRevision == null) return plain
      const revision = byKey.get(`${recipe.id}:${recipe.publishedRevision}`)
      return revision ? { ...plain, ...revision.snapshot } : plain
    })
  }

  // Minimal id/title projection of every recipe the given user could
  // plausibly want to link an ingredient to: their own (published or not)
  // plus everyone else's published ones. Used by AI import/generate to spot
  // an ingredient that's really a reference to a whole other recipe. Capped
  // well above what any real library size needs, to keep the Gemini prompt
  // built from this list bounded.
  async findLinkCandidates(userId: string): Promise<{ id: string; title: string; titleHe?: string }[]> {
    const recipes = await this.recipeModel
      .find(
        { $or: [{ ownerId: userId }, { publishedRevision: { $ne: null }, hidden: { $ne: true } }], deletedAt: { $exists: false } },
        { title: 1, titleHe: 1 },
      )
      .limit(500)
      .lean()
      .exec()
    return recipes.map(r => ({ id: String(r._id), title: r.title, titleHe: r.titleHe }))
  }

  async findAll() {
    const recipes = await this.recipeModel.find({ hidden: { $ne: true }, publishedRevision: { $ne: null } }).exec()
    const plain = await this.overlayPublishedSnapshots(recipes)
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
    const plain = await this.overlayPublishedSnapshots(recipes)
    const ids = plain.map(r => r.id)
    const [ratings, views, cooks] = await Promise.all([
      this.ratingsById(ids),
      this.activityLogService.viewCountsById(ids),
      this.cookLogService.countsById(ids),
    ])
    return this.attachRatingsAndViews(plain, ratings, views, cooks)
  }

  // Powers the "Following" feed - published recipes from a set of chef ids
  // (the caller's followingIds), most-recently-created first, capped at a
  // fixed page size rather than full cursor pagination (same tradeoff as
  // cook-history's list endpoint - this is one user's own feed, not a
  // public firehose, so the cap is plenty).
  async findPublishedByOwners(ownerIds: string[]) {
    if (ownerIds.length === 0) return []
    const recipes = await this.recipeModel
      .find({ ownerId: { $in: ownerIds }, hidden: { $ne: true }, publishedRevision: { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec()
    const plain = await this.overlayPublishedSnapshots(recipes)
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
      const [ratings, views, cooks, userCooks] = await Promise.all([
        this.ratingsById([recipe.id]),
        this.activityLogService.viewCountsById([recipe.id]),
        this.cookLogService.countsById([recipe.id]),
        this.cookLogService.userCountsById(userId, [recipe.id]),
      ])
      return (await this.attachRatingsAndViews([base], ratings, views, cooks, userCooks))[0]
    }
    const ownerName = recipe.ownerId ? (await this.usersService.namesByIds([recipe.ownerId]))[recipe.ownerId] ?? null : null
    return { ...recipe.toObject(), averageRating: null, ratingCount: 0, viewCount: 0, cookCount: 0, ownerName }
  }

  async findMine(userId: string) {
    const recipes = await this.recipeModel.find({ ownerId: userId, deletedAt: { $exists: false } }).sort({ updatedAt: -1 }).exec()
    return recipes.map(r => r.toObject())
  }

  // Bulk-AI drafts the user hasn't reviewed/saved yet - the "drafts in
  // progress" panel's data source. Ordered by batch so one bulk-generate
  // call's recipes stay grouped, then by creation order within a batch.
  async findPending(userId: string) {
    const recipes = await this.recipeModel
      .find({ ownerId: userId, pendingReview: true, deletedAt: { $exists: false } })
      .sort({ batchId: 1, createdAt: 1 })
      .exec()
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

  async createDraft(
    userId: string,
    dto: SaveRecipeDraftDto,
    opts: { pendingReview?: boolean; batchId?: string } = {},
  ): Promise<RecipeDocument> {
    await this.assertLinksResolve(dto.ingredients)
    const slug = await this.generateUniqueSlug(dto.title)
    const recipe = await this.recipeModel.create({
      ...dto, sources: dedupeSources(dto.sources), slug, ownerId: userId, status: 'draft', currentRevision: 1,
      pendingReview: opts.pendingReview ?? false, batchId: opts.batchId,
    })
    await this.saveNewRevision(recipe, userId)
    await this.activityLogService.record(userId, recipe.id, 'recipe_created')
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
    await this.assertLinksResolve(dto.ingredients)
    await this.assertNoCycle(id, dto.ingredients)
    // Editing a rejected recipe means the owner is addressing the feedback -
    // clear the rejected state so it isn't stuck showing "rejected" forever.
    const wasRejected = recipe.status === 'rejected'
    // The "AI generated" tag and its sources are immutable once set - a
    // recipe can never have its AI provenance edited or removed, no matter
    // what the request body contains.
    const aiLock = recipe.aiGenerated ? { aiGenerated: true, sources: recipe.sources } : {}
    // A pending/resolved duplicate dispute is scoped to the specific rejected
    // state it was raised against - once the owner edits the content, that
    // dispute no longer describes anything real and must not linger in the
    // admin's disputes queue (or keep showing stale duplicateReview info) for
    // a recipe that's back to being an ordinary draft.
    const update: Record<string, unknown> = {
      $set: {
        ...dto, sources: dedupeSources(dto.sources), ...aiLock, pendingReview: false,
        ...(wasRejected ? { status: 'draft', disputeStatus: 'none' } : {}),
      },
      $inc: { currentRevision: 1 },
    }
    if (wasRejected) update.$unset = { reviewComment: '', duplicateReview: '' }
    const updated = await this.recipeModel.findOneAndUpdate({ _id: id }, update, { new: true }).exec()
    if (!updated) throw new NotFoundException(`Recipe '${id}' not found`)
    await this.saveNewRevision(updated, userId)
    await this.activityLogService.record(userId, updated.id, 'recipe_updated')
    return updated
  }

  // Partial-save for just the photo - lets a quick photo fix go through
  // without a full save being blocked by unrelated invalid fields elsewhere
  // in the form. No revision bump, no quality review triggered.
  async updateImage(id: string, userId: string, isAdmin: boolean, image: string): Promise<RecipeDocument> {
    await this.getEditableOrThrow(id, userId, isAdmin)
    const updated = await this.recipeModel.findOneAndUpdate({ _id: id }, { $set: { image } }, { new: true }).exec()
    if (!updated) throw new NotFoundException(`Recipe '${id}' not found`)
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
    await this.assertLinksPublishable(id)

    await this.activityLogService.record(userId, id, 'recipe_submitted_for_review')

    if (!recipe.duplicateCheckOverride) {
      const candidates = await this.similarityService.findCandidates(recipe as unknown as SimilaritySourceRecipe, id)
      if (candidates.length > 0) {
        const verdict = await this.similarityService.judge(recipe as unknown as SimilaritySourceRecipe, candidates)
        await this.activityLogService.record(userId, id, 'ai_duplicate_check_used')
        if (verdict.isDuplicate && verdict.matchedRecipeId) {
          const matched = candidates.find(c => c.id === verdict.matchedRecipeId)
          // Gemini is only given the candidate list to choose from, but a
          // hallucinated id outside that list is unverifiable - blocking on
          // it would show a broken "similar recipe" link with no real match
          // behind it. Treat it as a non-duplicate verdict instead of
          // trusting an unresolvable match.
          if (matched) {
            recipe.status = 'rejected'
            recipe.duplicateReview = {
              isDuplicate: true,
              matchedRecipeId: verdict.matchedRecipeId,
              matchedRecipeTitle: matched.title,
              reason: verdict.reason,
              checkedAt: new Date().toISOString(),
            }
            recipe.qualityReview = undefined
            recipe.disputeStatus = 'none'
            await recipe.save()
            await this.activityLogService.record(userId, id, 'recipe_duplicate_blocked', { matchedRecipeId: verdict.matchedRecipeId })
            return recipe
          }
        }
      }
    }

    recipe.duplicateReview = undefined
    recipe.disputeStatus = 'none'
    let review: Awaited<ReturnType<typeof this.qualityService.review>>
    try {
      review = await this.qualityService.review(recipe.toObject())
    } catch (err) {
      // An uncaught error here (e.g. Gemini returning malformed JSON even
      // after its own internal retry) would otherwise surface to the owner
      // as a bare "Internal server error" with no indication it's worth
      // retrying - a BadGatewayException carries a message the frontend
      // actually shows.
      this.logger.error('AI quality review failed', err instanceof Error ? err.stack : err)
      throw new BadGatewayException('AI review failed - please try submitting again')
    }
    await this.activityLogService.record(userId, id, 'ai_quality_review_used')

    if (review.score >= RecipesService.PUBLISH_THRESHOLD) {
      const group = await this.groupingService.assignGroup(recipe)
      recipe.dishGroupId = group.id
      recipe.dishGroupName = group.name
      recipe.dishGroupNameHe = group.nameHe
      recipe.publishedRevision = recipe.currentRevision
      recipe.status = 'published'
      recipe.pendingReview = false
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await this.revisionModel.updateOne(
        { recipeId: id, revisionNumber: recipe.currentRevision },
        { $set: { published: true } },
      )
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_published')
      await this.activityLogService.record(userId, id, 'recipe_dish_group_assigned', { dishGroupId: group.id })
    } else {
      recipe.status = 'rejected'
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_rejected', { score: review.score })
    }
    return recipe
  }

  async disputeDuplicate(id: string, userId: string, isAdmin: boolean, message?: string): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    if (!recipe.duplicateReview?.isDuplicate) {
      throw new BadRequestException('This recipe was not blocked as a duplicate')
    }
    if (recipe.disputeStatus !== 'none') {
      throw new BadRequestException(`This recipe's duplicate block has already been disputed (status: ${recipe.disputeStatus})`)
    }
    recipe.disputeStatus = 'pending'
    recipe.disputeMessage = message
    recipe.disputeCreatedAt = new Date()
    await recipe.save()
    return recipe
  }

  async listDuplicateDisputes(): Promise<RecipeDocument[]> {
    return this.recipeModel.find({ disputeStatus: 'pending', deletedAt: { $exists: false } }).sort({ disputeCreatedAt: 1 }).exec()
  }

  async resolveDuplicateDispute(id: string, approve: boolean): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec()
    if (!recipe) {
      throw new NotFoundException(`Recipe '${id}' not found`)
    }
    if (recipe.disputeStatus !== 'pending') {
      throw new BadRequestException(`This recipe has no pending dispute (status: ${recipe.disputeStatus})`)
    }
    recipe.disputeResolvedAt = new Date()
    if (approve) {
      recipe.disputeStatus = 'approved'
      recipe.duplicateCheckOverride = true
      recipe.status = 'draft'
    } else {
      recipe.disputeStatus = 'denied'
    }
    await recipe.save()
    return recipe
  }

  private extractLinkedIds(ingredients: { items: { linkedRecipeId?: string }[] }[]): string[] {
    return [...new Set(ingredients.flatMap(g => (g.items ?? []).map(i => i.linkedRecipeId).filter((v): v is string => !!v)))]
  }

  // Every linkedRecipeId in the payload must resolve to a real, non-deleted
  // recipe - the link picker only ever offers already-persisted recipes, so
  // this should be structurally unreachable from the UI; it's a defensive
  // backend check (also catches a link target removed after being linked).
  private async assertLinksResolve(ingredients?: { items: { linkedRecipeId?: string }[] }[]): Promise<void> {
    const ids = this.extractLinkedIds(ingredients ?? [])
    if (ids.length === 0) return
    let found: { _id: unknown }[]
    try {
      found = await this.recipeModel.find({ _id: { $in: ids }, deletedAt: { $exists: false } }).select('_id').lean().exec()
    } catch (err) {
      if (isCastError(err)) found = []
      else throw err
    }
    const foundIds = new Set(found.map(r => String(r._id)))
    const missing = ids.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot save: linked recipe(s) not found: ${missing.join(', ')}`)
    }
  }

  // A recipe's own linked ingredients, read fresh from the database (used
  // while walking the link graph - not the in-memory document being saved).
  private async linkedIdsOf(id: string): Promise<string[]> {
    let recipe: { ingredients?: { items: { linkedRecipeId?: string }[] }[] } | null
    try {
      recipe = await this.recipeModel.findOne({ _id: id, deletedAt: { $exists: false } }).select('ingredients').lean().exec() as unknown as { ingredients?: { items: { linkedRecipeId?: string }[] }[] } | null
    } catch (err) {
      if (isCastError(err)) return []
      throw err
    }
    if (!recipe) return []
    return this.extractLinkedIds(recipe.ingredients ?? [])
  }

  // BFS over the linkedRecipeId graph starting from `startIds`, depth-capped
  // to guard against a runaway walk from bad data.
  // Stops as soon as `stopAt` is discovered, without querying its own links -
  // once the target is reachable the cycle is already proven, so there's no
  // need to keep walking (and, for a target that's the recipe being saved,
  // no need to re-fetch the in-flight document from the database).
  private async walkLinkedRecipes(startIds: string[], stopAt?: string): Promise<Set<string>> {
    const visited = new Set<string>()
    let frontier = [...new Set(startIds)]
    let depth = 0
    while (frontier.length > 0 && depth < 50) {
      const next: string[] = []
      for (const id of frontier) {
        if (visited.has(id)) continue
        visited.add(id)
        if (id === stopAt) return visited
        next.push(...(await this.linkedIdsOf(id)))
      }
      frontier = next
      depth += 1
    }
    return visited
  }

  // Only meaningful on update - a brand-new recipe has no id yet for
  // anything else to reference, so it can't already be part of a cycle.
  private async assertNoCycle(recipeId: string, ingredients?: { items: { linkedRecipeId?: string }[] }[]): Promise<void> {
    const directLinks = this.extractLinkedIds(ingredients ?? [])
    if (directLinks.length === 0) return
    const reachable = await this.walkLinkedRecipes(directLinks, recipeId)
    if (reachable.has(recipeId)) {
      throw new BadRequestException('This would create a circular recipe link')
    }
  }

  // Walks this recipe's linked ingredients transitively (reusing the same
  // graph walk the cycle-detection guard uses) and confirms every reachable
  // recipe is published - a recipe can't go live while something it depends
  // on as an ingredient isn't publicly visible yet.
  private async assertLinksPublishable(recipeId: string): Promise<void> {
    const directLinks = await this.linkedIdsOf(recipeId)
    if (directLinks.length === 0) return
    const reachable = await this.walkLinkedRecipes(directLinks)
    let linked: { _id: unknown; publishedRevision?: number | null; title?: string }[]
    try {
      linked = await this.recipeModel
        .find({ _id: { $in: [...reachable] }, deletedAt: { $exists: false } })
        .select('publishedRevision title')
        .lean()
        .exec()
    } catch (err) {
      if (isCastError(err)) linked = []
      else throw err
    }
    // A reachable id that doesn't come back at all (hard-missing, or filtered
    // out as soft-deleted) is just as unpublishable as one that came back
    // with no publishedRevision - it must not silently pass the guard by
    // being absent from the results. It has no title, so it's named by id.
    const foundIds = new Set(linked.map(r => String(r._id)))
    const missingIds = [...reachable].filter(id => !foundIds.has(id))
    const unpublished = linked.filter(r => r.publishedRevision == null)
    const names = [...unpublished.map(r => r.title), ...missingIds]
    if (names.length > 0) {
      throw new BadRequestException(`Cannot publish: linked recipe(s) not yet published: ${names.join(', ')}`)
    }
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
    const ingredientGroups = (recipe.ingredients ?? []) as { items?: { name?: string; linkedRecipeId?: string }[] }[]
    if (ingredientGroups.length === 0) {
      missing.push('ingredients')
    } else {
      const hasIncompleteItem = ingredientGroups.some(g =>
        !g.items || g.items.length === 0 || g.items.some(item => !item.name?.trim() && !item.linkedRecipeId)
      )
      if (hasIncompleteItem) missing.push('ingredients (every item needs a name or a linked recipe)')
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
    const isLinkedElsewhere = await this.recipeModel.exists({ 'ingredients.items.linkedRecipeId': id, deletedAt: { $exists: false } })
    if (isLinkedElsewhere) {
      throw new ForbiddenException('This recipe is used as a linked ingredient in another recipe and cannot be deleted')
    }
    recipe.deletedAt = new Date()
    await recipe.save()
    await this.activityLogService.record(userId, id, 'recipe_deleted', { title: recipe.title, ownerId: recipe.ownerId })
  }
}
