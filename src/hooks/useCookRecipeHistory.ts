import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchCookRecipeHistory, type CookRecipeHistory } from '../lib/cookHistory'

export function useCookRecipeHistory(recipeId: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [history, setHistory] = useState<CookRecipeHistory | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn || !recipeId) return
    fetchCookRecipeHistory(recipeId, getToken)
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken, recipeId])

  useEffect(() => { load() }, [load])

  return { history, loading }
}
