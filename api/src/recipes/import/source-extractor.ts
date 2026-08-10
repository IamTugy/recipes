import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

// The exact bilingual recipe shape produced by this feature - matches
// src/types.ts's Recipe/IngredientGroup/StepGroup field names exactly so
// the frontend can use the response directly with no renaming.
export interface ImportedRecipe {
  title: string
  titleHe?: string
  category?: string
  tags?: string[]
  tagsEn?: string[]
  cuisine?: string
  description?: string
  descriptionEn?: string
  prepTime?: number
  cookTime?: number
  servings?: number
  difficulty?: string
  ingredients?: { group?: string; groupEn?: string; items: { amount?: number; unit?: string; name: string; nameEn?: string }[] }[]
  steps?: { title?: string; titleEn?: string; items: { instruction: string; instructionEn?: string; timerMinutes?: number }[] }[]
  tips?: string[]
  tipsEn?: string[]
}

const SOCIAL_HOSTS = ['instagram.com', 'facebook.com', 'fb.watch', 'tiktok.com']

// Social post pages are JS-rendered and often auth-walled, so the plain
// fetch+JSON-LD approach in extractFromUrl below can't read them - callers
// should route these to a search-grounded extraction instead.
export function isSocialMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^(www|m|vm|vt)\./, '')
    return SOCIAL_HOSTS.some(social => host === social || host.endsWith(`.${social}`))
  } catch {
    return false
  }
}

// TikTok is the only one of the three with a public, keyless oEmbed endpoint;
// Instagram/Facebook oEmbed both require a Meta Graph API access token, so
// those rely entirely on the caption text the user shares plus Gemini search
// grounding (see RecipeImportService.importFromSocialUrl).
export async function extractTikTokOembed(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; author_name?: string }
    const parts = [data.title, data.author_name ? `By ${data.author_name}` : undefined].filter(Boolean)
    return parts.length ? parts.join('. ') : null
  } catch {
    return null
  }
}

export async function extractFromUrl(url: string): Promise<{ text: string; structured?: Partial<ImportedRecipe> }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Could not reach that page (HTTP ${res.status})`)
  const html = await res.text()

  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1])
      const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] ?? [parsed])
      const recipe = candidates.find((c: { '@type'?: string | string[] }) => {
        const type = c?.['@type']
        return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))
      })
      if (recipe) return { text: '', structured: recipe as Partial<ImportedRecipe> }
    } catch {
      // Not valid JSON-LD - keep looking at other script blocks.
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { text }
}

export async function extractFromPdf(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer)
    return result.text
  } catch (err) {
    throw new Error(`Could not read that PDF file: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function extractFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (err) {
    throw new Error(`Could not read that DOCX file: ${err instanceof Error ? err.message : String(err)}`)
  }
}
