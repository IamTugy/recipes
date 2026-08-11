import { Controller, Get, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { RankingService } from './ranking.service'

@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('leaderboard')
  async leaderboard(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined
    return this.rankingService.leaderboard(parsed && parsed > 0 ? parsed : undefined)
  }

  @Get('me')
  async me(@Req() req: Request & { userId: string }) {
    const points = await this.rankingService.pointsForUser(req.userId)
    return { userId: req.userId, points }
  }
}
