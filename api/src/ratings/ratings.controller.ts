import { Body, Controller, Param, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RatingsService } from './ratings.service'
import { RateRecipeDto } from './dto/rate-recipe.dto'

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Put(':slug')
  async rate(
    @Param('slug') slug: string,
    @Body() body: RateRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.ratingsService.rate(req.userId, slug, body.score)
  }
}
