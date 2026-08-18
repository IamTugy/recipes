import { Injectable, Logger } from '@nestjs/common'
import { createHash } from 'crypto'
import { RedisService } from '../redis/redis.service'

const GOOGLE_LANG: Record<'he' | 'en', string> = { he: 'iw', en: 'en' }
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
// Google's free translate endpoint is a GET request with the text
// URL-encoded into the query string - long text needs to be split into
// chunks under this length rather than truncated, or everything past the
// limit silently gets dropped (this used to cut recipe steps off mid-sentence).
const MAX_CHUNK_LENGTH = 500

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

    const chunks = this.chunkText(trimmed, MAX_CHUNK_LENGTH)
    const translatedChunks = await Promise.all(chunks.map(chunk => this.fetchTranslation(chunk, targetLang)))
    if (translatedChunks.some(chunk => chunk === null)) return trimmed

    const translated = translatedChunks.join(' ')
    await client.set(cacheKey, translated, 'EX', CACHE_TTL_SECONDS).catch(() => undefined)
    return translated
  }

  // Splits on whitespace so a chunk boundary never lands mid-word; each
  // chunk stays under maxLen except a single word that's already longer
  // than maxLen on its own (rare, and Google's endpoint handles that fine).
  private chunkText(text: string, maxLen: number): string[] {
    const words = text.split(/\s+/)
    const chunks: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxLen && current) {
        chunks.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) chunks.push(current)
    return chunks
  }

  private async fetchTranslation(text: string, targetLang: 'he' | 'en'): Promise<string | null> {
    const encoded = encodeURIComponent(text)
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
