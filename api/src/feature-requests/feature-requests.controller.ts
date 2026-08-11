import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { FeatureRequestsService } from './feature-requests.service'
import { CreateFeatureRequestDto } from './dto/create-feature-request.dto'
import { UpdateFeatureRequestDto } from './dto/update-feature-request.dto'
import { DenyFeatureRequestDto } from './dto/deny-feature-request.dto'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('feature-requests')
export class FeatureRequestsController {
  constructor(
    private readonly featureRequestsService: FeatureRequestsService,
    private readonly config: ConfigService,
    private readonly activityLog: ActivityLogService,
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
    const created = await this.featureRequestsService.create(req.userId, body.title, body.description)
    await this.activityLog.record(req.userId, undefined, 'feature_request_submitted', { title: body.title })
    return created
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
    await this.activityLog.record(req.userId, undefined, 'feature_request_approved', { number })
    return { approved: true }
  }

  @Post(':number/unapprove')
  async unapprove(
    @Param('number', ParseIntPipe) number: number,
    @Req() req: Request & { userId: string },
  ) {
    const ownerUserId = this.config.get<string>('OWNER_USER_ID')
    if (req.userId !== ownerUserId) {
      throw new ForbiddenException('Only the app owner can unapprove feature requests')
    }
    await this.featureRequestsService.unapprove(number)
    await this.activityLog.record(req.userId, undefined, 'feature_request_unapproved', { number })
    return { unapproved: true }
  }

  @Patch(':number')
  async update(
    @Param('number', ParseIntPipe) number: number,
    @Body() body: UpdateFeatureRequestDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.featureRequestsService.update(req.userId, number, body.title, body.description)
  }

  @Delete(':number')
  async withdraw(
    @Param('number', ParseIntPipe) number: number,
    @Req() req: Request & { userId: string },
  ) {
    await this.featureRequestsService.withdraw(req.userId, number)
    await this.activityLog.record(req.userId, undefined, 'feature_request_withdrawn', { number })
    return { withdrawn: true }
  }

  @Post(':number/deny')
  async deny(
    @Param('number', ParseIntPipe) number: number,
    @Body() body: DenyFeatureRequestDto,
    @Req() req: Request & { userId: string },
  ) {
    const ownerUserId = this.config.get<string>('OWNER_USER_ID')
    if (req.userId !== ownerUserId) {
      throw new ForbiddenException('Only the app owner can deny feature requests')
    }
    await this.featureRequestsService.deny(number, body.reason)
    await this.activityLog.record(req.userId, undefined, 'feature_request_denied', { number, reason: body.reason })
    return { denied: true }
  }
}
