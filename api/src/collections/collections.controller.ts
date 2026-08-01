import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { CollectionsService } from './collections.service'
import { CreateCollectionDto } from './dto/create-collection.dto'
import { AddRecipeDto } from './dto/add-recipe.dto'

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.collectionsService.listForUser(req.userId)
  }

  @Post()
  async create(@Body() body: CreateCollectionDto, @Req() req: Request & { userId: string }) {
    return this.collectionsService.create(req.userId, body.name)
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
    return { deleted: true }
  }

  @Post(':id/recipes')
  async addRecipe(
    @Param('id') id: string,
    @Body() body: AddRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.collectionsService.addRecipe(req.userId, id, body.slug)
  }

  @Delete(':id/recipes/:slug')
  async removeRecipe(
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Req() req: Request & { userId: string },
  ) {
    return this.collectionsService.removeRecipe(req.userId, id, slug)
  }
}
