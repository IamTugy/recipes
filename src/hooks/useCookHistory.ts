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
    Promise.all([fetchCookHistoryStats(getToken), fetchCookHistory(getToken)])
      .then(([statsResult, entriesResult]) => {
        setStats(statsResult)
        setEntries(entriesResult)
      })
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => { load() }, [load])

  return { stats, entries, loading }
}
