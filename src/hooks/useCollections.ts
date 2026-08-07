import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface RecipeCollection {
  _id: string
  name: string
  recipeIds: string[]
}

export function useCollections() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [collections, setCollections] = useState<RecipeCollection[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn) return
    apiFetch<RecipeCollection[]>('/collections', getToken)
      .then(setCollections)
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (name: string): Promise<RecipeCollection | null> => {
    const token = await getToken()
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    const created = await res.json()
    setCollections(prev => [created, ...prev])
    return created
  }, [getToken])

  const rename = useCallback(async (id: string, name: string) => {
    setCollections(prev => prev.map(c => (c._id === id ? { ...c, name } : c)))
    const token = await getToken()
    await fetch(`/api/collections/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name }),
    })
  }, [getToken])

  const remove = useCallback(async (id: string) => {
    setCollections(prev => prev.filter(c => c._id !== id))
    const token = await getToken()
    await fetch(`/api/collections/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }, [getToken])

  const addRecipe = useCallback(async (id: string, recipeId: string) => {
    setCollections(prev => prev.map(c => (c._id === id ? { ...c, recipeIds: [...new Set([...c.recipeIds, recipeId])] } : c)))
    const token = await getToken()
    await fetch(`/api/collections/${id}/recipes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ recipeId }),
    })
  }, [getToken])

  const removeRecipe = useCallback(async (id: string, recipeId: string) => {
    setCollections(prev => prev.map(c => (c._id === id ? { ...c, recipeIds: c.recipeIds.filter(s => s !== recipeId) } : c)))
    const token = await getToken()
    await fetch(`/api/collections/${id}/recipes/${recipeId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }, [getToken])

  return { collections, loading, create, rename, remove, addRecipe, removeRecipe }
}
