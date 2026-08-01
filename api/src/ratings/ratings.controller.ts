import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RatingsService } from './ratings.service'
import { RateRecipeDto } from './dto/rate-recipe.dto'

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Get(':slug/mine')
  async mine(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    return this.ratingsService.myRating(req.userId, slug)
  }

  @Get(':slug/reviews')
  async reviews(@Param('slug') slug: string) {
    return this.ratingsService.reviewsForRecipe(slug)
  }

  @Get(':slug/distribution')
  async distribution(@Param('slug') slug: string) {
    return this.ratingsService.distributionForRecipe(slug)
  }

  @Put(':slug')
  async rate(
    @Param('slug') slug: string,
    @Body() body: RateRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.ratingsService.rate(req.userId, slug, body.score, body.comment, body.photoUrl)
  }
}
