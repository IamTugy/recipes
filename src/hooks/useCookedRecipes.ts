import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export function useCookedRecipes() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [cookedSlugs, setCookedSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<string[]>('/cooked', getToken)
      .then(slugs => {
        if (!cancelled) setCookedSlugs(new Set(slugs))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  const toggle = useCallback(async (slug: string) => {
    const isCooked = cookedSlugs.has(slug)
    const method = isCooked ? 'DELETE' : 'POST'

    setCookedSlugs(prev => {
      const next = new Set(prev)
      if (isCooked) next.delete(slug)
      else next.add(slug)
      return next
    })

    const token = await getToken()
    const res = await fetch(`/api/cooked/${slug}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    if (!res.ok) {
      setCookedSlugs(prev => {
        const next = new Set(prev)
        if (isCooked) next.add(slug)
        else next.delete(slug)
        return next
      })
    }
  }, [cookedSlugs, getToken])

  return { cookedSlugs, toggle, loading }
}
