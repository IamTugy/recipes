import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealPlanEntry {
  id: string
  date: string
  recipeId: string
  mealType: MealType
}

export function useMealPlan(start: string, end: string) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [entries, setEntries] = useState<MealPlanEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    return apiFetch<MealPlanEntry[]>(`/meal-plan?start=${start}&end=${end}`, getToken)
      .then(data => setEntries(data))
  }, [start, end, getToken])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    reload().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, reload])

  async function addEntry(date: string, recipeId: string, mealType: MealType): Promise<void> {
    const token = await getToken()
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ date, recipeId, mealType }),
    })
    if (!res.ok) throw new ApiError(res.status, 'Failed to add meal plan entry')
    const entry: MealPlanEntry = await res.json()
    setEntries(prev => [...prev, entry])
  }

  async function removeEntry(id: string): Promise<void> {
    setEntries(prev => prev.filter(e => e.id !== id))
    const token = await getToken()
    await fetch(`/api/meal-plan/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }

  return { entries, loading, addEntry, removeEntry }
}
