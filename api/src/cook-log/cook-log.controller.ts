import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookLogService } from './cook-log.service'

@Controller('cooked')
export class CookLogController {
  constructor(private readonly cookLogService: CookLogService) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.cookLogService.listIds(req.userId)
  }

  @Post(':id')
  async mark(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.cookLogService.markCooked(req.userId, id)
    return { cooked: true }
  }

  @Delete(':id')
  async unmark(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.cookLogService.unmarkCooked(req.userId, id)
    return { cooked: false }
  }
}
