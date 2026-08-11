import { Body, Controller, Post, BadRequestException, Logger, Req } from '@nestjs/common'
import { Request } from 'express'
import { randomUUID } from 'crypto'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecipeAiGenerateService, type AiGeneratedRecipe } from './recipe-ai-generate.service'
import { RecipeImportService, applyRecipeLink, type LinkMatch } from '../import/recipe-import.service'
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
    private readonly importService: RecipeImportService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  async generate(@Body() body: { query?: string }, @Req() req: Request & { userId: string }) {
    if (!body.query?.trim()) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    const generated = await this.aiGenerateService.generate(body.query.trim())

    // Same "ingredient that's really a reference to another whole recipe"
    // matching used by manual/file import (see RecipeImportController) -
    // e.g. "chocolate cake and vanilla frosting" generating a frosting
    // ingredient item that should link to the frosting recipe generated in
    // the same batch, or to an existing recipe already in the app.
    const candidates = await this.recipesService.findLinkCandidates(req.userId)
    const links = await this.importService.resolveLinks(generated, candidates)
    for (const link of links) {
      if (!link.linkToExistingId) continue
      const recipe = generated[link.recipeIndex]
      if (recipe) applyRecipeLink(recipe, link.groupIndex, link.itemIndex, link.linkToExistingId)
    }

    // Gemini output is malformed-but-plausible more often than an actual
    // client request body, and this batch is never bound through the global
    // ValidationPipe (see toDraftDto above) - so each recipe is validated
    // here, same rules (whitelist matches ValidationPipe's config in
    // main.ts). One bad recipe in the batch is skipped rather than throwing
    // and leaving its already-persisted siblings orphaned as pending drafts.
    const validByOriginalIndex = new Map<number, SaveRecipeDraftDto>()
    for (const [index, recipe] of generated.entries()) {
      const dto = toDraftDto(recipe)
      const errors = await validate(dto, { whitelist: true })
      if (errors.length > 0) {
        this.logger.warn(
          `Skipping malformed AI-generated recipe "${recipe.title ?? '(untitled)'}": ${errors.map(e => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`,
        )
        continue
      }
      validByOriginalIndex.set(index, dto)
    }
    if (validByOriginalIndex.size === 0) {
      throw new BadRequestException('AI generation produced no usable recipes')
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
    // within-batch matches found above (e.g. a cake linking to its own
    // frosting, generated a few indices later in the same batch).
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

    await this.activityLog.record(req.userId, undefined, 'ai_recipe_generate_used', { count: created.length })
    return created
  }
}
