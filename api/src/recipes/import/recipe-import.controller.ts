import { Body, Controller, Post, BadRequestException, Logger, Req, UploadedFiles, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { randomUUID } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeImportService } from './recipe-import.service'
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

    const valid: SaveRecipeDraftDto[] = []
    for (const recipe of recipes) {
      const dto = toDraftDto(recipe)
      const errors = await validate(dto, { whitelist: true })
      if (errors.length > 0) {
        this.logger.warn(
          `Skipping malformed imported recipe "${recipe.title ?? '(untitled)'}": ${errors.map(e => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
        )
        continue
      }
      valid.push(dto)
    }
    if (valid.length === 0) {
      throw new BadRequestException('Import produced no usable recipes')
    }

    const batchId = randomUUID()
    const created = await Promise.all(
      valid.map(dto => this.recipesService.createDraft(req.userId, dto, { pendingReview: true, batchId })),
    )
    // An array return (vs. the single-recipe case's plain object above) is
    // exactly how the frontend tells the two outcomes apart - same contract
    // RecipeAiGenerateController uses for its own batch response.
    return created.map(r => r.toObject())
  }
}
