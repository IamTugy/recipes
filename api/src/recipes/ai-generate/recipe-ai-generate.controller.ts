import { Body, Controller, Post, BadRequestException, Req } from '@nestjs/common'
import { Request } from 'express'
import { randomUUID } from 'crypto'
import { RecipeAiGenerateService, type AiGeneratedRecipe } from './recipe-ai-generate.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'

// The generated recipe's fields (title, ingredients, steps, ...) line up
// with SaveRecipeDraftDto's - this is constructed in-process (never bound
// from an HTTP body), so no ValidationPipe/whitelist stripping applies to
// it, unlike the client-facing create/update routes.
function toDraftDto(recipe: AiGeneratedRecipe): SaveRecipeDraftDto {
  const dto = new SaveRecipeDraftDto()
  Object.assign(dto, recipe)
  return dto
}

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
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
    const batchId = randomUUID()
    const created = await Promise.all(
      generated.map(recipe => this.recipesService.createDraft(req.userId, toDraftDto(recipe), { pendingReview: true, batchId })),
    )
    await this.activityLog.record(req.userId, undefined, 'ai_recipe_generate_used', { count: created.length })
    return created.map(r => r.toObject())
  }
}
