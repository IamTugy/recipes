import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'crypto'
import sharp from 'sharp'
import { RedisService } from '../redis/redis.service'

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
const MAX_WIDTH = 1200
const JPEG_QUALITY = 82

// Link-preview crawlers (WhatsApp, iMessage, Slack...) fetch og:image
// directly and often silently drop it if it's too large - recipe photos are
// uploaded at full camera resolution (multi-MB, thousands of pixels wide),
// which is well past what those crawlers will render. This resizes/recompresses
// on the fly and caches the result so the preview always gets a lightweight image.
@Injectable()
export class ShareImageService {
  private readonly publicUrl: string

  constructor(
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL')!
  }

  // Only ever fetch images we already host - proxying an arbitrary
  // caller-supplied URL server-side would be an SSRF vector.
  isAllowedSource(url: string): boolean {
    return url.startsWith(`${this.publicUrl}/`)
  }

  async getResized(sourceUrl: string): Promise<Buffer> {
    const cacheKey = `share-image:${createHash('sha1').update(sourceUrl).digest('hex')}`
    const client = this.redisService.getClient()
    const cached = await client.getBuffer(cacheKey).catch(() => null)
    if (cached) return cached

    const resized = await this.fetchAndResize(sourceUrl)
    await client.set(cacheKey, resized, 'EX', CACHE_TTL_SECONDS).catch(() => undefined)
    return resized
  }

  private async fetchAndResize(sourceUrl: string): Promise<Buffer> {
    const res = await fetch(sourceUrl)
    if (!res.ok) throw new BadRequestException('Could not fetch the source image')
    const original = Buffer.from(await res.arrayBuffer())
    return sharp(original)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  }
}
