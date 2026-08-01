import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common'
import { Request } from 'express'
import { RecipesService } from './recipes.service'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async findAll() {
    return this.recipesService.findAll()
  }

  @Get('trending')
  async trending() {
    const slugs = await this.activityLog.trendingSlugs()
    const recipes = await Promise.all(slugs.map(slug => this.recipesService.findBySlug(slug)))
    return recipes.filter((r): r is NonNullable<typeof r> => !!r)
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.findBySlug(slug)
    if (!recipe) {
      throw new NotFoundException(`Recipe '${slug}' not found`)
    }
    await this.activityLog.record(req.userId, slug, 'recipe_viewed')
    return recipe
  }
}
