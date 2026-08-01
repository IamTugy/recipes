import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import type { Recipe } from '../types'
import { apiFetch, ApiError } from '../lib/api'

interface ApiRecipe extends Omit<Recipe, 'id'> {
  slug: string
}

function toRecipe(r: ApiRecipe): Recipe {
  return { ...r, id: r.slug }
}

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
  const data: ApiRecipe = await res.json()
  return data.slug
}

export async function updateRecipe(slug: string, input: RecipeInput, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  const res = await fetch(`/api/recipes/${slug}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to update recipe')
}

export async function deleteRecipe(slug: string, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  const res = await fetch(`/api/recipes/${slug}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to delete recipe')
}

export function useRecipes() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<ApiRecipe[]>('/recipes', getToken)
      .then(data => {
        if (cancelled) return
        setRecipes(data.map(toRecipe))
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

export function useRecipe(slug: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipe, setRecipe] = useState<Recipe | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !slug) return
    let cancelled = false

    apiFetch<ApiRecipe>(`/recipes/${slug}`, getToken)
      .then(data => {
        if (cancelled) return
        setRecipe(toRecipe(data))
      })
      .catch(() => {
        if (cancelled) return
        setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, slug, getToken])

  return { recipe, loading, notFound }
}

export function useTrending() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [trending, setTrending] = useState<Recipe[]>([])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<ApiRecipe[]>('/recipes/trending', getToken)
      .then(data => {
        if (!cancelled) setTrending(data.map(toRecipe))
      })
      .catch(() => { /* trending is a nice-to-have, fail silently */ })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  return { trending }
}
