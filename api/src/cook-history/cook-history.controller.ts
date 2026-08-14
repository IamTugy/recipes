import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookHistoryService } from './cook-history.service'

@Controller('cook-history')
export class CookHistoryController {
  constructor(private readonly cookHistoryService: CookHistoryService) {}

  @Get('stats')
  async getStats(@Req() req: Request & { userId: string }) {
    return this.cookHistoryService.getStats(req.userId)
  }

  @Get()
  async getHistory(@Req() req: Request & { userId: string }) {
    return this.cookHistoryService.getHistory(req.userId)
  }

  @Get(':recipeId')
  async getRecipeHistory(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    const result = await this.cookHistoryService.getRecipeHistory(req.userId, recipeId)
    if (!result) throw new NotFoundException()
    return result
  }
}
