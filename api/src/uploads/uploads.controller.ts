import { Body, Controller, Post } from '@nestjs/common'
import { UploadsService } from './uploads.service'
import { PresignUploadDto } from './dto/presign-upload.dto'
import { EnhancePhotoDto } from './dto/enhance-photo.dto'

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  async presign(@Body() body: PresignUploadDto) {
    return this.uploadsService.presignPhotoUpload(body.recipeId, body.contentType, body.purpose)
  }

  @Post('enhance-photo')
  async enhancePhoto(@Body() body: EnhancePhotoDto) {
    return this.uploadsService.enhancePhoto(body.recipeId, body.imageUrl, body.instructions)
  }
}
