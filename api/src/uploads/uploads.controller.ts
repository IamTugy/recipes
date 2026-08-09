import { Body, Controller, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { UploadsService } from './uploads.service'
import { PresignUploadDto } from './dto/presign-upload.dto'
import { EnhancePhotoDto } from './dto/enhance-photo.dto'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post('presign')
  async presign(@Body() body: PresignUploadDto) {
    return this.uploadsService.presignPhotoUpload(body.recipeId, body.contentType, body.purpose)
  }

  @Post('enhance-photo')
  async enhancePhoto(@Body() body: EnhancePhotoDto, @Req() req: Request & { userId: string }) {
    const result = await this.uploadsService.enhancePhoto(body.recipeId, body.imageUrl, body.instructions)
    await this.activityLog.record(req.userId, body.recipeId, 'ai_photo_enhance_used')
    return result
  }
}
