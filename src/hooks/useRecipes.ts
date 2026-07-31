import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import type { Recipe } from '../types'
import { apiFetch } from '../lib/api'

interface ApiRecipe extends Omit<Recipe, 'id'> {
  slug: string
}

function toRecipe(r: ApiRecipe): Recipe {
  return { ...r, id: r.slug }
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
