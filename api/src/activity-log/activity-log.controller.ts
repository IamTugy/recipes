import { Body, Controller, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { ActivityLogService } from './activity-log.service'
import { SearchPerformedDto } from './dto/search-performed.dto'

@Controller('activity')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Post('search')
  async logSearch(@Body() body: SearchPerformedDto, @Req() req: Request & { userId: string }) {
    await this.activityLogService.record(req.userId, undefined, 'search_performed', {
      query: body.query,
      resultsCount: body.resultsCount,
    })
    return { logged: true }
  }
}
