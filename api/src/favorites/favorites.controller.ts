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
    return this.favoritesService.listIds(req.userId)
  }

  @Post(':id')
  async add(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.favoritesService.add(req.userId, id)
    await this.activityLog.record(req.userId, id, 'favorited')
    return { favorited: true }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.favoritesService.remove(req.userId, id)
    await this.activityLog.record(req.userId, id, 'unfavorited')
    return { favorited: false }
  }
}
