import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

@Injectable()
export class UploadsService {
  private readonly s3: S3Client
  private readonly bucket: string
  private readonly publicUrl: string

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET')!
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL')!
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
    })
  }

  async presignReviewPhotoUpload(recipeSlug: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType]
    const key = `reviews/${recipeSlug}/${randomUUID()}.${extension}`

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 })
    return { uploadUrl, publicUrl: `${this.publicUrl}/${key}` }
  }
}
