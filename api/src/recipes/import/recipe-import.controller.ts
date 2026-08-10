import { Body, Controller, Post, BadRequestException, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'
import { RecipeImportService } from './recipe-import.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'

@Controller('recipes/import')
export class RecipeImportController {
  constructor(
    private readonly importService: RecipeImportService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @Body() body: { text?: string; url?: string },
    @Req() req: Request & { userId: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!body.text && !body.url && !file) {
      throw new BadRequestException('Provide text, a URL, or a file')
    }
    if (body.url && (body.text || file)) {
      throw new BadRequestException('Provide a URL on its own, not combined with text or a file')
    }

    const result = body.url
      ? await this.importService.importFromUrl(body.url)
      : file
        ? await this.importService.importFromFile(file.buffer, file.mimetype, body.text)
        : await this.importService.importFromText(body.text!)

    await this.activityLog.record(req.userId, undefined, 'ai_recipe_import_used')
    return result
  }
}
