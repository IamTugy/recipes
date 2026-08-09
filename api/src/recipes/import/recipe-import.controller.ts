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
    const sourcesProvided = [body.text, body.url, file].filter(Boolean).length
    if (sourcesProvided === 0) {
      throw new BadRequestException('Provide text, a URL, or a file')
    }
    if (sourcesProvided > 1) {
      throw new BadRequestException('Provide only one of text, a URL, or a file')
    }

    const result = body.text
      ? await this.importService.importFromText(body.text)
      : body.url
        ? await this.importService.importFromUrl(body.url)
        : await this.importService.importFromFile(file!.buffer, file!.mimetype)

    await this.activityLog.record(req.userId, undefined, 'ai_recipe_import_used')
    return result
  }
}
