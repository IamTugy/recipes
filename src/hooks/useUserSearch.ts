import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface UserSearchResult {
  userId: string
  name?: string
  imageUrl?: string
}

// Debounced by-name lookup for the "find people to follow" page - waits
// 300ms after typing stops so we don't fire a request per keystroke.
export function useUserSearch(query: string) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const trimmed = query.trim()
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      if (!trimmed) {
        setResults([])
        setLoading(false)
        return
      }
      setLoading(true)
      apiFetch<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(trimmed)}`, getToken)
        .then(data => { if (!cancelled) setResults(data) })
        .catch(() => { /* search is a nice-to-have, fail silently */ })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, trimmed ? 300 : 0)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, isLoaded, isSignedIn, getToken])

  return { results, loading }
}
