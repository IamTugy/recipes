import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookLogService } from './cook-log.service'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('cooked')
export class CookLogController {
  constructor(
    private readonly cookLogService: CookLogService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.cookLogService.listIds(req.userId)
  }

  @Post(':id')
  async mark(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.cookLogService.markCooked(req.userId, id)
    await this.activityLog.record(req.userId, id, 'recipe_cooked')
    return { cooked: true }
  }

  @Delete(':id')
  async unmark(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.cookLogService.unmarkCooked(req.userId, id)
    await this.activityLog.record(req.userId, id, 'recipe_uncooked')
    return { cooked: false }
  }
}
