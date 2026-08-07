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
  if (!res.ok) throw new ApiError(res.status, 'Failed to delete recipe')
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

export async function submitForReview(id: string, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/submit`, getToken)
  notifyRecipeStatusChanged()
  return recipe
}

export async function cancelSubmission(id: string, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/cancel-submission`, getToken)
  notifyRecipeStatusChanged()
  return recipe
}

export async function approveSubmission(id: string, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/approve`, getToken)
  notifyRecipeStatusChanged()
  return recipe
}

export async function rejectSubmission(id: string, comment: string, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/reject`, getToken, { comment })
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

export function usePendingSubmissions(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/admin/submissions', getToken).then(data => setRecipes(data))
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
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !id) return
    let cancelled = false

    apiFetch<Recipe>(`/recipes/${id}`, getToken)
      .then(data => {
        if (cancelled) return
        setRecipe(data)
      })
      .catch(() => {
        if (cancelled) return
        setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, id, getToken])

  return { recipe, loading, notFound }
}

export function useChefProfile(userId: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [name, setName] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    let cancelled = false

    apiFetch<{ userId: string; name: string | null; recipes: Recipe[] }>(`/recipes/chef/${userId}`, getToken)
      .then(data => {
        if (cancelled) return
        setName(data.name)
        setRecipes(data.recipes)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, userId, getToken])

  return { name, recipes, loading }
}

export function useTrending() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [trending, setTrending] = useState<Recipe[]>([])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<Recipe[]>('/recipes/trending', getToken)
      .then(data => {
        if (!cancelled) setTrending(data)
      })
      .catch(() => { /* trending is a nice-to-have, fail silently */ })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  return { trending }
}
