import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

// Warms the service worker's runtime cache for favorited recipes the user
// hasn't necessarily opened recently, so they're still readable offline.
function prefetchForOffline(slugs: string[], getToken: () => Promise<string | null>) {
  if (!('serviceWorker' in navigator)) return
  for (const slug of slugs) {
    apiFetch(`/recipes/${slug}`, getToken).catch(() => { /* best-effort offline warmup */ })
  }
}

export function useFavorites() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<string[]>('/favorites', getToken)
      .then(slugs => {
        if (!cancelled) {
          setFavoriteSlugs(new Set(slugs))
          prefetchForOffline(slugs, getToken)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  const toggle = useCallback(async (slug: string) => {
    const isFavorited = favoriteSlugs.has(slug)
    const method = isFavorited ? 'DELETE' : 'POST'

    setFavoriteSlugs(prev => {
      const next = new Set(prev)
      if (isFavorited) next.delete(slug)
      else next.add(slug)
      return next
    })

    const token = await getToken()
    const res = await fetch(`/api/favorites/${slug}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    if (!res.ok) {
      setFavoriteSlugs(prev => {
        const next = new Set(prev)
        if (isFavorited) next.add(slug)
        else next.delete(slug)
        return next
      })
    } else if (!isFavorited) {
      prefetchForOffline([slug], getToken)
    }
  }, [favoriteSlugs, getToken])

  return { favoriteSlugs, toggle, loading }
}
