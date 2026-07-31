import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { FavoritesService } from './favorites.service'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('favorites')
export class FavoritesController {
  constructor(
    private readonly favoritesService: FavoritesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.favoritesService.listSlugs(req.userId)
  }

  @Post(':slug')
  async add(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.favoritesService.add(req.userId, slug)
    await this.activityLog.record(req.userId, slug, 'favorited')
    return { favorited: true }
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.favoritesService.remove(req.userId, slug)
    await this.activityLog.record(req.userId, slug, 'unfavorited')
    return { favorited: false }
  }
}
