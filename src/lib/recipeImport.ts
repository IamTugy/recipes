import { ApiError } from './api'
import type { Category, Difficulty, KosherType, Nutrition } from '../types'

export interface ImportedRecipe {
  title: string
  titleHe?: string
  category?: Category
  tags?: string[]
  tagsEn?: string[]
  cuisine?: string
  image?: string
  description?: string
  descriptionEn?: string
  prepTime?: number
  cookTime?: number
  servings?: number
  difficulty?: Difficulty
  kosherType?: KosherType
  nutrition?: Nutrition
  aiGenerated?: boolean
  sources?: { title: string; url: string }[]
  ingredients?: { group?: string; groupEn?: string; items: { amount: number; unit: string; name: string; nameEn?: string }[] }[]
  steps?: { title?: string; titleEn?: string; items: { instruction: string; instructionEn?: string; timerMinutes?: number }[] }[]
  tips?: string[]
  tipsEn?: string[]
}

// Keep in sync with client_max_body_size in nginx.conf - checking client-side
// gives an instant, specific error instead of the upload running for a while
// and then failing with a raw network error once nginx cuts it off.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export async function importRecipe(
  input: { text?: string; url?: string; file?: File; image?: File },
  getToken: () => Promise<string | null>
): Promise<ImportedRecipe> {
  const token = await getToken()
  const formData = new FormData()
  if (input.text) formData.append('text', input.text)
  if (input.url) formData.append('url', input.url)
  if (input.file) formData.append('file', input.file)
  if (input.image) formData.append('image', input.image)

  let res: Response
  try {
    res = await fetch('/api/recipes/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
  } catch {
    // A failed fetch() call itself (as opposed to a non-ok response) means
    // the request never completed - could be a dropped connection, an
    // upload that exceeded the server's size limit mid-transfer, or no
    // network at all. Status 0 marks this as a network-level failure so
    // callers can show a message distinct from a normal API error.
    throw new ApiError(0, 'Network error - check your connection and try again')
  }
  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiError(413, 'That file is too large to upload')
    }
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? 'Import failed')
  }
  return res.json()
}
