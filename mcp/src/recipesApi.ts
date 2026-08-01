const BASE_URL = process.env.RECIPES_API_BASE_URL ?? 'https://recipes.tugy.dev/api'
const API_KEY = process.env.RECIPES_API_KEY

if (!API_KEY) {
  throw new Error('Set RECIPES_API_KEY to the same key configured on the recipes API')
}

export class RecipesApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new RecipesApiError(res.status, body || `Request to ${path} failed with ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function listMyRecipes() {
  return request<unknown[]>('/recipes/mine')
}

export function getRecipe(slug: string) {
  return request<unknown>(`/recipes/${encodeURIComponent(slug)}`)
}

export function createRecipe(body: Record<string, unknown>) {
  return request<{ slug: string }>('/recipes', { method: 'POST', body: JSON.stringify(body) })
}

export function updateRecipe(slug: string, body: Record<string, unknown>) {
  return request<{ slug: string }>(`/recipes/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) })
}

export function submitForReview(slug: string) {
  return request<unknown>(`/recipes/${encodeURIComponent(slug)}/submit`, { method: 'POST' })
}

export async function presignAndUploadPhoto(recipeSlug: string, imageBase64: string, contentType: string): Promise<string> {
  const { uploadUrl, publicUrl } = await request<{ uploadUrl: string; publicUrl: string }>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ recipeSlug, contentType }),
  })
  const buffer = Buffer.from(imageBase64, 'base64')
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  })
  if (!putRes.ok) throw new RecipesApiError(putRes.status, 'Failed to upload photo to storage')
  return publicUrl
}
