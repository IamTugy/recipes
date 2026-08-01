import { Body, Controller, Post } from '@nestjs/common'
import { UploadsService } from './uploads.service'
import { PresignUploadDto } from './dto/presign-upload.dto'

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  async presign(@Body() body: PresignUploadDto) {
    return this.uploadsService.presignPhotoUpload(body.recipeSlug, body.contentType, body.purpose)
  }
}
