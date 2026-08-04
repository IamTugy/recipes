import { Body, Controller, Post } from '@nestjs/common'
import { NutritionService } from './nutrition.service'
import { NutritionEstimateRequestDto } from './nutrition-estimate.dto'

@Controller('recipes/nutrition')
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Post('estimate')
  async estimate(@Body() body: NutritionEstimateRequestDto) {
    return this.nutritionService.estimate(body)
  }
}
