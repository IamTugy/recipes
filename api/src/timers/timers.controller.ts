import { Body, Controller, Delete, Param, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { TimersService } from './timers.service'

interface CreateTimerBody {
  clientId: string
  recipeId: string
  label: string
  endsAt: number
}

@Controller('timers')
export class TimersController {
  constructor(private readonly timersService: TimersService) {}

  @Post()
  async create(@Body() body: CreateTimerBody, @Req() req: Request & { userId: string }) {
    await this.timersService.upsert(req.userId, body.clientId, body.recipeId, body.label, body.endsAt)
    return { ok: true }
  }

  @Delete(':clientId')
  async remove(@Param('clientId') clientId: string, @Req() req: Request & { userId: string }) {
    await this.timersService.remove(req.userId, clientId)
    return { ok: true }
  }
}
