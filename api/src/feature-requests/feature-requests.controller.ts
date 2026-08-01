import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { FeatureRequestsService } from './feature-requests.service'
import { CreateFeatureRequestDto } from './dto/create-feature-request.dto'

@Controller('feature-requests')
export class FeatureRequestsController {
  constructor(
    private readonly featureRequestsService: FeatureRequestsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    const requests = await this.featureRequestsService.list()
    const ownerUserId = this.config.get<string>('OWNER_USER_ID')
    if (req.userId === ownerUserId) return requests
    return requests.filter(r => r.submittedBy === req.userId)
  }

  @Post()
  async create(@Body() body: CreateFeatureRequestDto, @Req() req: Request & { userId: string }) {
    return this.featureRequestsService.create(req.userId, body.title, body.description)
  }

  @Post(':number/approve')
  async approve(
    @Param('number', ParseIntPipe) number: number,
    @Req() req: Request & { userId: string },
  ) {
    const ownerUserId = this.config.get<string>('OWNER_USER_ID')
    if (req.userId !== ownerUserId) {
      throw new ForbiddenException('Only the app owner can approve feature requests')
    }
    await this.featureRequestsService.approve(number)
    return { approved: true }
  }
}
