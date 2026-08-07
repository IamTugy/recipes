import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { RecipesService } from './recipes.service'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { UsersService } from '../users/users.service'
import { SaveRecipeDraftDto } from './dto/save-recipe-draft.dto'
import { RejectSubmissionDto } from './dto/reject-submission.dto'

@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
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
    const ids = await this.activityLog.trendingIds()
    const recipes = await Promise.all(ids.map(id => this.recipesService.findById(id)))
    return recipes.filter((r): r is NonNullable<typeof r> => !!r)
  }

  @Get('mine')
  async findMine(@Req() req: Request & { userId: string }) {
    return this.recipesService.findMine(req.userId)
  }

  @Get('chef/:userId')
  async chefProfile(@Param('userId') userId: string) {
    const [recipes, names] = await Promise.all([
      this.recipesService.findPublishedByOwner(userId),
      this.usersService.namesByIds([userId]),
    ])
    return { userId, name: names[userId] ?? null, recipes }
  }

  @Get('admin/submissions')
  async listPendingSubmissions(@Req() req: Request & { userId: string }) {
    if (!this.isAdmin(req.userId)) throw new ForbiddenException('Admins only')
    return this.recipesService.listPendingSubmissions()
  }

  @Get('public/:id')
  async findPublic(@Param('id') id: string) {
    const recipe = await this.recipesService.findById(id)
    if (!recipe) {
      throw new NotFoundException(`Recipe '${id}' not found`)
    }
    return recipe
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.findByIdForUser(id, req.userId, this.isAdmin(req.userId))
    if (!recipe) {
      throw new NotFoundException(`Recipe '${id}' not found`)
    }
    if (recipe.publishedRevision != null) {
      await this.activityLog.record(req.userId, id, 'recipe_viewed')
    }
    return recipe
  }

  @Get(':id/revisions')
  async listRevisions(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const includeDrafts = await this.recipesService.canViewDraftRevisions(id, req.userId, this.isAdmin(req.userId))
    return this.recipesService.listRevisions(id, includeDrafts)
  }

  @Post()
  async create(@Body() body: SaveRecipeDraftDto, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.createDraft(req.userId, body)
    return recipe.toObject()
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: SaveRecipeDraftDto,
    @Req() req: Request & { userId: string },
  ) {
    const recipe = await this.recipesService.updateDraft(id, req.userId, this.isAdmin(req.userId), body)
    return recipe.toObject()
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.submitForReview(id, req.userId, this.isAdmin(req.userId))
    return recipe.toObject()
  }

  @Post(':id/cancel-submission')
  async cancelSubmission(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.cancelSubmission(id, req.userId, this.isAdmin(req.userId))
    return recipe.toObject()
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    if (!this.isAdmin(req.userId)) throw new ForbiddenException('Admins only')
    const recipe = await this.recipesService.approveSubmission(id, req.userId)
    return recipe.toObject()
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: RejectSubmissionDto,
    @Req() req: Request & { userId: string },
  ) {
    if (!this.isAdmin(req.userId)) throw new ForbiddenException('Admins only')
    const recipe = await this.recipesService.rejectSubmission(id, body.comment)
    return recipe.toObject()
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.recipesService.remove(id, req.userId, this.isAdmin(req.userId))
    return { deleted: true }
  }
}
