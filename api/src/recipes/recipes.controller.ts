import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RecipesService } from './recipes.service'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { RecipeDto } from './dto/recipe.dto'

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

  @Post()
  async create(@Body() body: RecipeDto) {
    const recipe = await this.recipesService.create(body)
    return recipe.toObject()
  }

  @Put(':slug')
  async update(@Param('slug') slug: string, @Body() body: RecipeDto) {
    const recipe = await this.recipesService.update(slug, body)
    if (!recipe) {
      throw new NotFoundException(`Recipe '${slug}' not found`)
    }
    return recipe.toObject()
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string) {
    await this.recipesService.remove(slug)
    return { deleted: true }
  }
}
