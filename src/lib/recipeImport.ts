import { ApiError } from './api'
import type { Category, Difficulty } from '../types'

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
  featured?: boolean
  ingredients?: { group?: string; groupEn?: string; items: { amount: number; unit: string; name: string; nameEn?: string }[] }[]
  steps?: { title?: string; titleEn?: string; items: { instruction: string; instructionEn?: string; timerMinutes?: number }[] }[]
  tips?: string[]
  tipsEn?: string[]
}

export async function importRecipe(
  input: { text?: string; url?: string; file?: File },
  getToken: () => Promise<string | null>
): Promise<ImportedRecipe> {
  const token = await getToken()
  const formData = new FormData()
  if (input.text) formData.append('text', input.text)
  if (input.url) formData.append('url', input.url)
  if (input.file) formData.append('file', input.file)

  const res = await fetch('/api/recipes/import', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? 'Import failed')
  }
  return res.json()
}
