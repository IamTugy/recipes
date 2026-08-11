import { Body, Controller, Post, BadRequestException, Logger, Req, UploadedFiles, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { randomUUID, createHash } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeImportService, applyRecipeLink, type LinkMatch } from './recipe-import.service'
import type { ImportedRecipe } from './source-extractor'
import { RecipesService } from '../recipes.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { JobsService } from '../../jobs/jobs.service'

// Mirrors RecipeAiGenerateController's toDraftDto - this batch is constructed
// in-process from Gemini output, never bound from an HTTP body, so it must be
// validated manually rather than relying on the global ValidationPipe.
function toDraftDto(recipe: ImportedRecipe): SaveRecipeDraftDto {
  return plainToInstance(SaveRecipeDraftDto, recipe)
}

function dedupeKeyFor(body: { text?: string; url?: string }, file?: Express.Multer.File, image?: Express.Multer.File): string {
  const parts = [
    body.url,
    body.text,
    file ? `file:${file.originalname}:${file.size}` : undefined,
    image ? `image:${image.originalname}:${image.size}` : undefined,
  ].filter(Boolean)
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function labelFor(body: { text?: string; url?: string }, file?: Express.Multer.File, image?: Express.Multer.File): string {
  if (body.url) return body.url
  if (file) return file.originalname
  if (image) return image.originalname
  return (body.text ?? '').slice(0, 80) || 'Recipe import'
}

@Controller('recipes/import')
export class RecipeImportController {
  private readonly logger = new Logger(RecipeImportController.name)

  constructor(
    private readonly importService: RecipeImportService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
    private readonly jobsService: JobsService,
  ) {}

  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]))
  async import(
    @Body() body: { text?: string; url?: string },
    @Req() req: Request & { userId: string },
    @UploadedFiles() files?: { file?: Express.Multer.File[]; image?: Express.Multer.File[] },
  ): Promise<{ jobId: string }> {
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

    const userId = req.userId
    const { job, isExisting } = await this.jobsService.create(
      userId,
      'import',
      labelFor(body, file, image),
      dedupeKeyFor(body, file, image),
    )
    if (!isExisting) {
      void this.jobsService.run(job.id, () => this.runImport(body, userId, file, image))
    }
    return { jobId: job.id }
  }

  // Spot ingredients that are really references to another whole recipe -
  // either another recipe in this same batch (a dish and its separately
  // extracted sauce) or one already in the app (published, or the user's
  // own). Matches against existing recipes are applied immediately; a match
  // within the batch can't be applied yet since the target recipe doesn't
  // have a real id until it's created below. Every result - one recipe or
  // many - is persisted as a pendingReview draft sharing one batchId; there
  // is no more "single recipe returns unsaved for live prefill" path, since
  // the async model means the caller isn't waiting on this page for a
  // hand-off.
  private async runImport(
    body: { text?: string; url?: string },
    userId: string,
    file?: Express.Multer.File,
    image?: Express.Multer.File,
  ): Promise<string[]> {
    const recipes = body.url
      ? await this.importService.importFromUrl(body.url, body.text)
      : file
        ? await this.importService.importFromFile(file.buffer, file.mimetype, body.text)
        : image
          ? await this.importService.importFromImage(image.buffer, image.mimetype, body.text)
          : await this.importService.importFromText(body.text!)

    await this.activityLog.record(userId, undefined, 'ai_recipe_import_used')

    const candidates = await this.recipesService.findLinkCandidates(userId)
    const links = await this.importService.resolveLinks(recipes, candidates)
    for (const link of links) {
      if (!link.linkToExistingId) continue
      const recipe = recipes[link.recipeIndex]
      if (recipe) applyRecipeLink(recipe, link.groupIndex, link.itemIndex, link.linkToExistingId)
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
    const createdIds: string[] = []
    for (const [index, dto] of validByOriginalIndex) {
      const recipe = await this.recipesService.createDraft(userId, dto, { pendingReview: true, batchId })
      idByOriginalIndex.set(index, recipe.id)
      createdIds.push(recipe.id)
    }

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
        await this.recipesService.updateDraft(sourceId, userId, false, sourceDto)
      } catch (err) {
        // A cycle or other guard tripping here means the match was wrong -
        // leave that one recipe unlinked rather than failing the whole batch.
        this.logger.warn(`Could not apply within-batch recipe link for "${sourceDto.title}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return createdIds
  }
}
