import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { CollectionsService } from './collections.service'
import { CreateCollectionDto } from './dto/create-collection.dto'
import { AddRecipeDto } from './dto/add-recipe.dto'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('collections')
export class CollectionsController {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.collectionsService.listForUser(req.userId)
  }

  @Post()
  async create(@Body() body: CreateCollectionDto, @Req() req: Request & { userId: string }) {
    const collection = await this.collectionsService.create(req.userId, body.name)
    await this.activityLog.record(req.userId, undefined, 'collection_created', { name: body.name })
    return collection
  }

  @Put(':id')
  async rename(
    @Param('id') id: string,
    @Body() body: CreateCollectionDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.collectionsService.rename(req.userId, id, body.name)
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.collectionsService.remove(req.userId, id)
    await this.activityLog.record(req.userId, undefined, 'collection_deleted')
    return { deleted: true }
  }

  @Post(':id/recipes')
  async addRecipe(
    @Param('id') id: string,
    @Body() body: AddRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    const collection = await this.collectionsService.addRecipe(req.userId, id, body.recipeId)
    await this.activityLog.record(req.userId, body.recipeId, 'recipe_added_to_collection')
    return collection
  }

  @Delete(':id/recipes/:recipeId')
  async removeRecipe(
    @Param('id') id: string,
    @Param('recipeId') recipeId: string,
    @Req() req: Request & { userId: string },
  ) {
    const collection = await this.collectionsService.removeRecipe(req.userId, id, recipeId)
    await this.activityLog.record(req.userId, recipeId, 'recipe_removed_from_collection')
    return collection
  }
}
