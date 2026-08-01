import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookLogService } from './cook-log.service'

@Controller('cooked')
export class CookLogController {
  constructor(private readonly cookLogService: CookLogService) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.cookLogService.listSlugs(req.userId)
  }

  @Post(':slug')
  async mark(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.cookLogService.markCooked(req.userId, slug)
    return { cooked: true }
  }

  @Delete(':slug')
  async unmark(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.cookLogService.unmarkCooked(req.userId, slug)
    return { cooked: false }
  }
}
