import { Body, Controller, Post, BadRequestException, Logger, Req, UploadedFiles, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { randomUUID } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeImportService, applyRecipeLink, type LinkMatch } from './recipe-import.service'
import type { ImportedRecipe } from './source-extractor'
import { RecipesService } from '../recipes.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'
import { ActivityLogService } from '../../activity-log/activity-log.service'

// Mirrors RecipeAiGenerateController's toDraftDto - this batch is constructed
// in-process from Gemini output, never bound from an HTTP body, so it must be
// validated manually rather than relying on the global ValidationPipe.
function toDraftDto(recipe: ImportedRecipe): SaveRecipeDraftDto {
  return plainToInstance(SaveRecipeDraftDto, recipe)
}

@Controller('recipes/import')
export class RecipeImportController {
  private readonly logger = new Logger(RecipeImportController.name)

  constructor(
    private readonly importService: RecipeImportService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]))
  async import(
    @Body() body: { text?: string; url?: string },
    @Req() req: Request & { userId: string },
    @UploadedFiles() files?: { file?: Express.Multer.File[]; image?: Express.Multer.File[] },
  ) {
    const file = files?.file?.[0]
    const image = files?.image?.[0]

    if (!body.text && !body.url && !file && !image) {
      throw new BadRequestException('Provide text, a URL, a file, or a photo')
    }
    if (body.url && (file || image)) {
      throw new BadRequestException('Provide a URL on its own or with caption text, not combined with a file or a photo')
    }
    if (file && image) {
      throw new BadRequestException('Provide a document file or a photo, not both')
    }

    const recipes = body.url
      ? await this.importService.importFromUrl(body.url, body.text)
      : file
        ? await this.importService.importFromFile(file.buffer, file.mimetype, body.text)
        : image
          ? await this.importService.importFromImage(image.buffer, image.mimetype, body.text)
          : await this.importService.importFromText(body.text!)

    await this.activityLog.record(req.userId, undefined, 'ai_recipe_import_used')

    // Spot ingredients that are really references to another whole recipe -
    // either another recipe in this same batch (a dish and its separately
    // extracted sauce) or one already in the app (published, or the user's
    // own). Matches against existing recipes are applied immediately; a
    // match within the batch can't be applied yet since the target recipe
    // doesn't have a real id until it's created below.
    const candidates = await this.recipesService.findLinkCandidates(req.userId)
    const links = await this.importService.resolveLinks(recipes, candidates)
    for (const link of links) {
      if (!link.linkToExistingId) continue
      const recipe = recipes[link.recipeIndex]
      if (recipe) applyRecipeLink(recipe, link.groupIndex, link.itemIndex, link.linkToExistingId)
    }

    // A source describing exactly one recipe keeps the existing UX: the
    // recipe object is handed straight back so the frontend can prefill the
    // edit form before anything is saved. A source with several recipes (a
    // cooking-class PDF, a multi-recipe photo, ...) instead gets saved as a
    // batch of pending-review drafts, same as bulk AI generation - editing
    // N recipes one at a time through the same prefill flow would mean
    // discarding all but the first the moment the user navigates away.
    if (recipes.length === 1) {
      return recipes[0]
    }

    const validByOriginalIndex = new Map<number, SaveRecipeDraftDto>()
    for (const [index, recipe] of recipes.entries()) {
      const dto = toDraftDto(recipe)
      const errors = await validate(dto, { whitelist: true })
      if (errors.length > 0) {
        this.logger.warn(
          `Skipping malformed imported recipe "${recipe.title ?? '(untitled)'}": ${errors.map(e => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
        )
        continue
      }
      validByOriginalIndex.set(index, dto)
    }
    if (validByOriginalIndex.size === 0) {
      throw new BadRequestException('Import produced no usable recipes')
    }

    const batchId = randomUUID()
    const idByOriginalIndex = new Map<number, string>()
    const created: Record<string, unknown>[] = []
    for (const [index, dto] of validByOriginalIndex) {
      const recipe = await this.recipesService.createDraft(req.userId, dto, { pendingReview: true, batchId })
      idByOriginalIndex.set(index, recipe.id)
      created.push(recipe.toObject())
    }

    // Now that every recipe in the batch has a real id, apply the
    // within-batch matches found above (e.g. a dish linking to its sauce,
    // extracted a few indices later in the same source).
    const withinBatchLinks = links.filter((l): l is LinkMatch & { linkToRecipeIndex: number } => l.linkToRecipeIndex !== undefined)
    for (const link of withinBatchLinks) {
      const sourceDto = validByOriginalIndex.get(link.recipeIndex)
      const sourceId = idByOriginalIndex.get(link.recipeIndex)
      const targetId = idByOriginalIndex.get(link.linkToRecipeIndex)
      if (!sourceDto || !sourceId || !targetId) continue
      const item = sourceDto.ingredients?.[link.groupIndex]?.items?.[link.itemIndex]
      if (!item) continue
      item.linkedRecipeId = targetId
      try {
        const updated = await this.recipesService.updateDraft(sourceId, req.userId, false, sourceDto)
        const createdIndex = created.findIndex(r => r.id === sourceId)
        if (createdIndex !== -1) created[createdIndex] = updated.toObject()
      } catch (err) {
        // A cycle or other guard tripping here means the match was wrong -
        // leave that one recipe unlinked rather than failing the whole batch.
        this.logger.warn(`Could not apply within-batch recipe link for "${sourceDto.title}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // An array return (vs. the single-recipe case's plain object above) is
    // exactly how the frontend tells the two outcomes apart - same contract
    // RecipeAiGenerateController uses for its own batch response.
    return created
  }
}
