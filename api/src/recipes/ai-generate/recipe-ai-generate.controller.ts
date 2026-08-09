import { Body, Controller, Post, BadRequestException, Req } from '@nestjs/common'
import { Request } from 'express'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
  constructor(
    private readonly aiGenerateService: RecipeAiGenerateService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  async generate(@Body() body: { query?: string }, @Req() req: Request & { userId: string }) {
    if (!body.query?.trim()) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    const result = await this.aiGenerateService.generate(body.query.trim())
    await this.activityLog.record(req.userId, undefined, 'ai_recipe_generate_used')
    return result
  }
}
