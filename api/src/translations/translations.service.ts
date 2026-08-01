import { Injectable, Logger } from '@nestjs/common'
import { createHash } from 'crypto'
import { RedisService } from '../redis/redis.service'

const GOOGLE_LANG: Record<'he' | 'en', string> = { he: 'iw', en: 'en' }
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30

@Injectable()
export class TranslationsService {
  private readonly logger = new Logger(TranslationsService.name)

  constructor(private readonly redisService: RedisService) {}

  async translate(text: string, targetLang: 'he' | 'en'): Promise<string> {
    const trimmed = text.trim()
    if (!trimmed) return trimmed

    const cacheKey = `translation:${targetLang}:${createHash('sha1').update(trimmed).digest('hex')}`
    const client = this.redisService.getClient()
    const cached = await client.get(cacheKey).catch(() => null)
    if (cached !== null) return cached

    const translated = await this.fetchTranslation(trimmed, targetLang)
    if (translated !== null) {
      await client.set(cacheKey, translated, 'EX', CACHE_TTL_SECONDS).catch(() => undefined)
      return translated
    }
    return trimmed
  }

  private async fetchTranslation(text: string, targetLang: 'he' | 'en'): Promise<string | null> {
    const encoded = encodeURIComponent(text.slice(0, 500))
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${GOOGLE_LANG[targetLang]}&dt=t&q=${encoded}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const translated = (data[0] as [string][]).map(seg => seg[0]).join('')
      if (!translated) throw new Error('Empty translation')
      return translated
    } catch (err) {
      this.logger.warn(`Translation failed: ${err instanceof Error ? err.message : err}`)
      return null
    }
  }
}
