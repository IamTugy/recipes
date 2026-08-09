import { Body, Controller, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { NutritionService } from './nutrition.service'
import { NutritionEstimateRequestDto } from './nutrition-estimate.dto'
import { ActivityLogService } from '../../activity-log/activity-log.service'

@Controller('recipes/nutrition')
export class NutritionController {
  constructor(
    private readonly nutritionService: NutritionService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post('estimate')
  async estimate(@Body() body: NutritionEstimateRequestDto, @Req() req: Request & { userId: string }) {
    const result = await this.nutritionService.estimate(body)
    await this.activityLog.record(req.userId, undefined, 'ai_nutrition_estimate_used')
    return result
  }
}
