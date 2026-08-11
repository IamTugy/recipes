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

// The one guardrail that always applies regardless of what the user asks
// for: it must stay a photo of the exact same dish, never an illustration
// or a different meal. Background/setting/lighting are fair game for the
// user's own instructions (e.g. "show it outdoors") to override.
const BASE_PROMPT = `You are editing a home-cooked food photo for a recipe website. Do not add, remove, or alter the food itself, and do not change the plate or dish - it must still look like a real photograph of the exact same meal, not an illustration or an AI-generated scene. Return only the edited image.`

// Used when the user hasn't asked for anything specific - a conservative
// cleanup rather than a stylistic change.
const DEFAULT_ENHANCE_INSTRUCTIONS = 'Make minimal, realistic edits: clean up or blur a messy/distracting background, improve lighting and color balance, and improve the framing/positioning of the plate if it helps the composition.'

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

  async presignPhotoUpload(recipeId: string, contentType: string, purpose: 'review' | 'recipe' | 'feature-request' = 'review'): Promise<{ uploadUrl: string; publicUrl: string }> {
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType]
    const folder = purpose === 'recipe' ? 'recipes' : purpose === 'feature-request' ? 'feature-requests' : 'reviews'
    const key = `${folder}/${recipeId}/${randomUUID()}.${extension}`

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 })
    return { uploadUrl, publicUrl: `${this.publicUrl}/${key}` }
  }

  async enhancePhoto(recipeId: string, imageUrl: string, instructions?: string): Promise<{ publicUrl: string }> {
    // Only accept images we already host - fetching arbitrary caller-supplied
    // URLs server-side would be an SSRF vector.
    if (!imageUrl.startsWith(`${this.publicUrl}/`)) {
      throw new BadRequestException('imageUrl must point to an uploaded photo')
    }

    const sourceResponse = await fetch(imageUrl)
    if (!sourceResponse.ok) throw new BadRequestException('Could not fetch the source image')
    const contentType = sourceResponse.headers.get('content-type') ?? 'image/jpeg'
    const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer())

    const prompt = `${BASE_PROMPT}\n\n${instructions?.trim() || DEFAULT_ENHANCE_INSTRUCTIONS}`
    const enhanced = await this.gemini.editImage(sourceBuffer.toString('base64'), contentType, prompt)

    const extension = EXTENSION_BY_CONTENT_TYPE[enhanced.mimeType] ?? 'png'
    const key = `recipes/${recipeId}/${randomUUID()}.${extension}`
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
