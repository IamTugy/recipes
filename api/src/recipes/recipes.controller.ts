import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { RecipesService } from './recipes.service'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { UsersService } from '../users/users.service'
import { SaveRecipeDraftDto } from './dto/save-recipe-draft.dto'
import { UpdateRecipeImageDto } from './dto/update-recipe-image.dto'

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

  @Get('pending')
  async findPending(@Req() req: Request & { userId: string }) {
    return this.recipesService.findPending(req.userId)
  }

  @Get('chef/:userId')
  async chefProfile(@Param('userId') userId: string) {
    const [recipes, names] = await Promise.all([
      this.recipesService.findPublishedByOwner(userId),
      this.usersService.namesByIds([userId]),
    ])
    return { userId, name: names[userId] ?? null, recipes }
  }

  // Public "in progress" feed - any signed-in user can see recent AI review
  // outcomes across everyone's recipes, not just their own.
  @Get('submissions')
  async listRecentSubmissions() {
    const recipes = await this.recipesService.listRecentSubmissions()
    const names = await this.usersService.namesByIds([...new Set(recipes.map(r => r.ownerId).filter((id): id is string => !!id))])
    return recipes.map(r => ({ ...r, ownerName: r.ownerId ? names[r.ownerId] ?? null : null }))
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
      await this.activityLog.record(req.userId, recipe.id, 'recipe_viewed')
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

  @Patch(':id/image')
  async updateImage(
    @Param('id') id: string,
    @Body() body: UpdateRecipeImageDto,
    @Req() req: Request & { userId: string },
  ) {
    const recipe = await this.recipesService.updateImage(id, req.userId, this.isAdmin(req.userId), body.image)
    return recipe.toObject()
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.submitForReview(id, req.userId, this.isAdmin(req.userId))
    return recipe.toObject()
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.recipesService.remove(id, req.userId, this.isAdmin(req.userId))
    return { deleted: true }
  }
}
