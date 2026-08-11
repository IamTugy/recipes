import { ApiError } from './api'

export async function generateRecipesWithAi(
  query: string,
  getToken: () => Promise<string | null>
): Promise<{ jobId: string }> {
  const token = await getToken()
  const res = await fetch('/api/recipes/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? 'Generation failed')
  }
  return res.json()
}
