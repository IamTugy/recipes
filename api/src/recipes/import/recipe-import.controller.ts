import { Body, Controller, Post, BadRequestException, Req, UploadedFiles, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
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
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]))
  async import(
    @Body() body: { text?: string; url?: string },
    @Req() req: Request & { userId: string },
    @UploadedFiles() files?: { file?: Express.Multer.File[]; image?: Express.Multer.File[] },
  ) {
    const file = files?.file?.[0]
    const image = files?.image?.[0]

    if (!body.text && !body.url && !file && !image) {
      throw new BadRequestException('Provide text, a URL, a file, or a photo')
    }
    if (body.url && (file || image)) {
      throw new BadRequestException('Provide a URL on its own or with caption text, not combined with a file or a photo')
    }
    if (file && image) {
      throw new BadRequestException('Provide a document file or a photo, not both')
    }

    const result = body.url
      ? await this.importService.importFromUrl(body.url, body.text)
      : file
        ? await this.importService.importFromFile(file.buffer, file.mimetype, body.text)
        : image
          ? await this.importService.importFromImage(image.buffer, image.mimetype, body.text)
          : await this.importService.importFromText(body.text!)

    await this.activityLog.record(req.userId, undefined, 'ai_recipe_import_used')
    return result
  }
}
