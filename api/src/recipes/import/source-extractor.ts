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
