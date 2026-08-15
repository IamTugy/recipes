import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import type { Recipe } from '../types'
import { apiFetch, ApiError } from '../lib/api'
import { notifyRecipeStatusChanged, onRecipeStatusChanged } from '../lib/recipeEvents'

export type RecipeInput = Omit<Recipe, 'id' | 'averageRating' | 'ratingCount' | 'viewCount'>

export async function createRecipe(input: RecipeInput, getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken()
  const res = await fetch('/api/recipes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to create recipe')
  const data: Recipe = await res.json()
  return data.id
}

export async function updateRecipe(id: string, input: RecipeInput, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  const res = await fetch(`/api/recipes/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to update recipe')
}

export async function deleteRecipe(id: string, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  const res = await fetch(`/api/recipes/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? 'Failed to delete recipe')
  }
}

async function postAction(path: string, getToken: () => Promise<string | null>, body?: unknown): Promise<Recipe> {
  const token = await getToken()
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? `Request to ${path} failed with ${res.status}`)
  }
  return res.json()
}

// Synchronous: the required-field check and AI quality review both run
// server-side within this one request. The returned recipe already carries
// the outcome - status is 'published' (score met the threshold) or
// 'rejected' (with qualityReview.findings/suggestedFields set) - there's no
// separate pending state to poll for.
export async function submitForReview(id: string, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/submit`, getToken)
  notifyRecipeStatusChanged()
  return recipe
}

export async function disputeDuplicate(id: string, message: string | undefined, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/dispute-duplicate`, getToken, message ? { message } : undefined)
  notifyRecipeStatusChanged()
  return recipe
}

export async function resolveDuplicateDispute(id: string, approve: boolean, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/dispute-duplicate/resolve`, getToken, { approve })
  notifyRecipeStatusChanged()
  return recipe
}

export function useMyRecipes(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/mine', getToken).then(data => setRecipes(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return
    let cancelled = false

    reload()
      .catch(() => { /* stale badge/list is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    const unsubscribe = onRecipeStatusChanged(() => { reload().catch(() => {}) })
    return () => { cancelled = true; unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, getToken])

  return { recipes, loading, reload }
}

// Bulk-AI drafts the user hasn't reviewed/saved yet - powers the
// "drafts in progress" panel on the recipe editor.
export function usePendingDrafts(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/pending', getToken).then(data => setRecipes(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return
    let cancelled = false

    reload()
      .catch(() => { /* stale panel is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    const unsubscribe = onRecipeStatusChanged(() => { reload().catch(() => {}) })
    return () => { cancelled = true; unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, getToken])

  return { recipes, loading, reload }
}

// Admin-only: recipes with a pending duplicate-block dispute. The backend
// itself 403s a non-owner call - this hook is only ever mounted from the
// owner-gated section of SubmissionsPage.
export function useDuplicateDisputes(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/disputes', getToken).then(data => setRecipes(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return
    let cancelled = false

    reload()
      .catch(() => { /* stale admin panel is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    const unsubscribe = onRecipeStatusChanged(() => { reload().catch(() => {}) })
    return () => { cancelled = true; unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, getToken])

  return { recipes, loading, reload }
}

// Public "in progress" feed - recent AI review outcomes across every user's
// recipes, visible to any signed-in user (not admin-gated).
export function useSubmissionsFeed(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/submissions', getToken).then(data => setRecipes(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return
    let cancelled = false

    reload()
      .catch(() => { /* handled by the caller retrying, no need to surface here */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    const unsubscribe = onRecipeStatusChanged(() => { reload().catch(() => {}) })
    return () => { cancelled = true; unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, getToken])

  return { recipes, loading, reload }
}

export function useRecipes() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<Recipe[]>('/recipes', getToken)
      .then(data => {
        if (cancelled) return
        setRecipes(data)
        setError(null)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err : new Error('Failed to load recipes'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  return { recipes, loading, error }
}

export function useRecipe(id: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipe, setRecipe] = useState<Recipe | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  // Id-keyed rather than a plain boolean: notFound is DERIVED below as
  // `notFoundId === id`, so the instant `id` changes to anything other than
  // the id that failed, notFound is synchronously false on that very render -
  // no reset call needed, and no timing window where a stale true can leak
  // into a sibling effect's read (see useCookSession's self-heal effect).
  const [notFoundId, setNotFoundId] = useState<string | null>(null)
  const [lastId, setLastId] = useState(id)

  // Synchronous render-phase reset (React's documented "adjust state when
  // props change" pattern) - runs during render, before any effect, so a
  // sibling effect elsewhere in the same component can never observe a
  // stale notFoundId for the new id. An effect-based reset would run one
  // flush too late for that guarantee.
  if (lastId !== id) {
    setLastId(id)
    setNotFoundId(null)
  }

  function reload() {
    if (!id) return Promise.resolve()
    setNotFoundId(null)
    return apiFetch<Recipe>(`/recipes/${id}`, getToken)
      .then(data => setRecipe(data))
      .catch(() => setNotFoundId(id))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !id) return
    let cancelled = false

    apiFetch<Recipe>(`/recipes/${id}`, getToken)
      .then(data => {
        if (cancelled) return
        setRecipe(data)
        setNotFoundId(prev => (prev === id ? null : prev))
      })
      .catch(() => {
        if (cancelled) return
        setNotFoundId(id)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, id, getToken])

  return { recipe, loading, notFound: notFoundId === id && !!id, reload }
}

export function useChefProfile(userId: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [name, setName] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    let cancelled = false

    apiFetch<{ userId: string; name: string | null; imageUrl: string | null; recipes: Recipe[] }>(`/recipes/chef/${userId}`, getToken)
      .then(data => {
        if (cancelled) return
        setName(data.name)
        setImageUrl(data.imageUrl)
        setRecipes(data.recipes)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, userId, getToken])

  return { name, imageUrl, recipes, loading }
}

export function useTrending() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [trending, setTrending] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<Recipe[]>('/recipes/trending', getToken)
      .then(data => {
        if (!cancelled) setTrending(data)
      })
      .catch(() => { /* trending is a nice-to-have, fail silently */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  return { trending, loading }
}
