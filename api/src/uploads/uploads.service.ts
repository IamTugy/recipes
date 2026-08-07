import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { GeminiService } from '../ai/gemini.service'

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// Deliberately conservative: this asks Gemini to retouch the photo the user
// already took rather than generate a new one, per the issue's "minimal
// changes, not full ai generated picture" requirement.
const ENHANCE_PROMPT = `You are retouching a home-cooked food photo for a recipe website. Make minimal, realistic edits only: clean up or blur a messy/distracting background, improve lighting and color balance, and improve the framing/positioning of the plate if it helps the composition. Do not add, remove, or alter the food itself, and do not change the plate or dish. The result must still look like a real photograph of the exact same meal, not an illustration or AI-generated scene. Return only the edited image.`

@Injectable()
export class UploadsService {
  private readonly s3: S3Client
  private readonly bucket: string
  private readonly publicUrl: string

  constructor(
    private readonly config: ConfigService,
    private readonly gemini: GeminiService,
  ) {
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

  async presignPhotoUpload(recipeSlug: string, contentType: string, purpose: 'review' | 'recipe' = 'review'): Promise<{ uploadUrl: string; publicUrl: string }> {
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType]
    const folder = purpose === 'recipe' ? 'recipes' : 'reviews'
    const key = `${folder}/${recipeSlug}/${randomUUID()}.${extension}`

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 })
    return { uploadUrl, publicUrl: `${this.publicUrl}/${key}` }
  }

  async enhancePhoto(recipeSlug: string, imageUrl: string): Promise<{ publicUrl: string }> {
    // Only accept images we already host - fetching arbitrary caller-supplied
    // URLs server-side would be an SSRF vector.
    if (!imageUrl.startsWith(`${this.publicUrl}/`)) {
      throw new BadRequestException('imageUrl must point to an uploaded photo')
    }

    const sourceResponse = await fetch(imageUrl)
    if (!sourceResponse.ok) throw new BadRequestException('Could not fetch the source image')
    const contentType = sourceResponse.headers.get('content-type') ?? 'image/jpeg'
    const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer())

    const enhanced = await this.gemini.editImage(sourceBuffer.toString('base64'), contentType, ENHANCE_PROMPT)

    const extension = EXTENSION_BY_CONTENT_TYPE[enhanced.mimeType] ?? 'png'
    const key = `recipes/${recipeSlug}/${randomUUID()}.${extension}`
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(enhanced.data, 'base64'),
        ContentType: enhanced.mimeType,
      }),
    )
    return { publicUrl: `${this.publicUrl}/${key}` }
  }
}
