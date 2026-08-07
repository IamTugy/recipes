import { Body, Controller, Post, BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
  constructor(private readonly aiGenerateService: RecipeAiGenerateService) {}

  @Post()
  async generate(@Body() body: { query?: string }) {
    if (!body.query?.trim()) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    return this.aiGenerateService.generate(body.query.trim())
  }
}
