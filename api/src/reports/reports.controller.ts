import { Body, Controller, ForbiddenException, Get, Param, Patch, Req } from '@nestjs/common'
import { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { ReportsService } from './reports.service'
import { UpdateReportDto } from './dto/update-report.dto'

// Admin-only - reviewing user reports of recipe content (inappropriate,
// incorrect, spam, copyright, other). Not exposed to regular users; they
// only ever POST /recipes/:id/report, handled by RecipesController.
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly config: ConfigService,
  ) {}

  private isAdmin(userId: string): boolean {
    return userId === this.config.get<string>('OWNER_USER_ID')
  }

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    if (!this.isAdmin(req.userId)) {
      throw new ForbiddenException('Only the app owner can view reports')
    }
    return this.reportsService.listAll()
  }

  @Patch(':id')
  async resolve(
    @Param('id') id: string,
    @Body() body: UpdateReportDto,
    @Req() req: Request & { userId: string },
  ) {
    if (!this.isAdmin(req.userId)) {
      throw new ForbiddenException('Only the app owner can resolve reports')
    }
    await this.reportsService.resolve(id, body.resolved)
    return { resolved: body.resolved }
  }
}
