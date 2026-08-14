import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchCookRecipeHistory, type CookRecipeHistory } from '../lib/cookHistory'

export function useCookRecipeHistory(recipeId: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [history, setHistory] = useState<CookRecipeHistory | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn || !recipeId) return
    let cancelled = false
    fetchCookRecipeHistory(recipeId, getToken)
      .then(result => {
        if (cancelled) return
        setHistory(result)
      })
      .catch(() => { /* stale/empty history is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken, recipeId])

  useEffect(() => load(), [load])

  return { history, loading }
}
