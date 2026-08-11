import { Controller, Get, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { JobsService } from './jobs.service'

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(@Query('status') status: string | undefined, @Req() req: Request & { userId: string }) {
    const jobs = await this.jobsService.listMine(req.userId, status === 'active')
    return jobs.map(j => j.toObject())
  }
}
