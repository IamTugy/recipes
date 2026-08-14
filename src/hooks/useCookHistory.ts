import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchCookHistoryStats, fetchCookHistory, type CookHistoryStats, type CookHistoryEntry } from '../lib/cookHistory'

export function useCookHistory() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [stats, setStats] = useState<CookHistoryStats | null>(null)
  const [entries, setEntries] = useState<CookHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    Promise.all([fetchCookHistoryStats(getToken), fetchCookHistory(getToken)])
      .then(([statsResult, entriesResult]) => {
        if (cancelled) return
        setStats(statsResult)
        setEntries(entriesResult)
      })
      .catch(() => { /* stale/empty history is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => load(), [load])

  return { stats, entries, loading }
}
