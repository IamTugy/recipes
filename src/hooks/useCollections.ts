import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface RecipeCollection {
  _id: string
  name: string
  recipeSlugs: string[]
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

  const remove = useCallback(async (id: string) => {
    setCollections(prev => prev.filter(c => c._id !== id))
    const token = await getToken()
    await fetch(`/api/collections/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }, [getToken])

  const addRecipe = useCallback(async (id: string, slug: string) => {
    setCollections(prev => prev.map(c => (c._id === id ? { ...c, recipeSlugs: [...new Set([...c.recipeSlugs, slug])] } : c)))
    const token = await getToken()
    await fetch(`/api/collections/${id}/recipes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ slug }),
    })
  }, [getToken])

  const removeRecipe = useCallback(async (id: string, slug: string) => {
    setCollections(prev => prev.map(c => (c._id === id ? { ...c, recipeSlugs: c.recipeSlugs.filter(s => s !== slug) } : c)))
    const token = await getToken()
    await fetch(`/api/collections/${id}/recipes/${slug}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }, [getToken])

  return { collections, loading, create, remove, addRecipe, removeRecipe }
}
