import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'crypto'
import sharp from 'sharp'
import { RedisService } from '../redis/redis.service'

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
const DEFAULT_WIDTH = 1200
export const ALLOWED_WIDTHS = [160, 320, 640, 1200] as const
const JPEG_QUALITY = 82

// Started as link-preview support (WhatsApp, iMessage, Slack... fetch
// og:image directly and often silently drop it if it's too large) but is now
// also how every <img> in the app gets its recipe photo: photos are uploaded
// at full camera resolution (multi-MB, thousands of pixels wide) - a 48px
// list thumbnail downloading that same original wastes far more relative to
// its own size than a full-width hero does. This resizes/recompresses on the
// fly to the exact width the caller needs and caches the result per width.
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

  async getResized(sourceUrl: string, width: number = DEFAULT_WIDTH): Promise<Buffer> {
    const cacheKey = `share-image:${width}:${createHash('sha1').update(sourceUrl).digest('hex')}`
    const client = this.redisService.getClient()
    const cached = await client.getBuffer(cacheKey).catch(() => null)
    if (cached) return cached

    const resized = await this.fetchAndResize(sourceUrl, width)
    await client.set(cacheKey, resized, 'EX', CACHE_TTL_SECONDS).catch(() => undefined)
    return resized
  }

  private async fetchAndResize(sourceUrl: string, width: number): Promise<Buffer> {
    const res = await fetch(sourceUrl)
    if (!res.ok) throw new BadRequestException('Could not fetch the source image')
    const original = Buffer.from(await res.arrayBuffer())
    return sharp(original)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  }
}
