import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { RecipesService } from './recipes.service'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { SaveRecipeDraftDto } from './dto/save-recipe-draft.dto'
import { RejectSubmissionDto } from './dto/reject-submission.dto'

@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ConfigService,
  ) {}

  private isAdmin(userId: string): boolean {
    return userId === this.config.get<string>('OWNER_USER_ID')
  }

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

  @Get('mine')
  async findMine(@Req() req: Request & { userId: string }) {
    return this.recipesService.findMine(req.userId)
  }

  @Get('admin/submissions')
  async listPendingSubmissions(@Req() req: Request & { userId: string }) {
    if (!this.isAdmin(req.userId)) throw new ForbiddenException('Admins only')
    return this.recipesService.listPendingSubmissions()
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.findBySlugForUser(slug, req.userId, this.isAdmin(req.userId))
    if (!recipe) {
      throw new NotFoundException(`Recipe '${slug}' not found`)
    }
    if (recipe.status === 'published') {
      await this.activityLog.record(req.userId, slug, 'recipe_viewed')
    }
    return recipe
  }

  @Get(':slug/revisions')
  async listRevisions(@Param('slug') slug: string) {
    return this.recipesService.listRevisions(slug)
  }

  @Post()
  async create(@Body() body: SaveRecipeDraftDto, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.createDraft(req.userId, body)
    return recipe.toObject()
  }

  @Put(':slug')
  async update(
    @Param('slug') slug: string,
    @Body() body: SaveRecipeDraftDto,
    @Req() req: Request & { userId: string },
  ) {
    const recipe = await this.recipesService.updateDraft(slug, req.userId, this.isAdmin(req.userId), body)
    return recipe.toObject()
  }

  @Post(':slug/submit')
  async submit(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.submitForReview(slug, req.userId, this.isAdmin(req.userId))
    return recipe.toObject()
  }

  @Post(':slug/cancel-submission')
  async cancelSubmission(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.cancelSubmission(slug, req.userId, this.isAdmin(req.userId))
    return recipe.toObject()
  }

  @Post(':slug/approve')
  async approve(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    if (!this.isAdmin(req.userId)) throw new ForbiddenException('Admins only')
    const recipe = await this.recipesService.approveSubmission(slug, req.userId)
    return recipe.toObject()
  }

  @Post(':slug/reject')
  async reject(
    @Param('slug') slug: string,
    @Body() body: RejectSubmissionDto,
    @Req() req: Request & { userId: string },
  ) {
    if (!this.isAdmin(req.userId)) throw new ForbiddenException('Admins only')
    const recipe = await this.recipesService.rejectSubmission(slug, body.comment)
    return recipe.toObject()
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.recipesService.remove(slug, req.userId, this.isAdmin(req.userId))
    return { deleted: true }
  }
}
