import { Body, Controller, Post, BadRequestException, Logger, Req } from '@nestjs/common'
import { Request } from 'express'
import { randomUUID } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeAiGenerateService, type AiGeneratedRecipe } from './recipe-ai-generate.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'

// The generated recipe's fields (title, ingredients, steps, ...) line up
// with SaveRecipeDraftDto's, but this is constructed in-process (never bound
// from an HTTP body), so unlike the client-facing create/update routes the
// global ValidationPipe never runs on it automatically - callers must
// validate it themselves. See `generate()`, which does so per-recipe below.
function toDraftDto(recipe: AiGeneratedRecipe): SaveRecipeDraftDto {
  return plainToInstance(SaveRecipeDraftDto, recipe)
}

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
  private readonly logger = new Logger(RecipeAiGenerateController.name)

  constructor(
    private readonly aiGenerateService: RecipeAiGenerateService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  async generate(@Body() body: { query?: string }, @Req() req: Request & { userId: string }) {
    if (!body.query?.trim()) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    const generated = await this.aiGenerateService.generate(body.query.trim())

    // Gemini output is malformed-but-plausible more often than an actual
    // client request body, and this batch is never bound through the global
    // ValidationPipe (see toDraftDto above) - so each recipe is validated
    // here, same rules (whitelist matches ValidationPipe's config in
    // main.ts). One bad recipe in the batch is skipped rather than throwing
    // and leaving its already-persisted siblings orphaned as pending drafts.
    const valid: SaveRecipeDraftDto[] = []
    for (const recipe of generated) {
      const dto = toDraftDto(recipe)
      const errors = await validate(dto, { whitelist: true })
      if (errors.length > 0) {
        this.logger.warn(
          `Skipping malformed AI-generated recipe "${recipe.title ?? '(untitled)'}": ${errors.map(e => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
        )
        continue
      }
      valid.push(dto)
    }
    if (valid.length === 0) {
      throw new BadRequestException('AI generation produced no usable recipes')
    }

    const batchId = randomUUID()
    const created = await Promise.all(
      valid.map(dto => this.recipesService.createDraft(req.userId, dto, { pendingReview: true, batchId })),
    )
    await this.activityLog.record(req.userId, undefined, 'ai_recipe_generate_used', { count: created.length })
    return created.map(r => r.toObject())
  }
}
