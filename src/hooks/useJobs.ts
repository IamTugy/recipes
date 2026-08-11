import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { fetchJobs } from '../lib/jobs'
import { usePolling } from './usePolling'
import type { Job } from '../types'

const POLL_INTERVAL_MS = 5000

export function useJobs() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return fetchJobs(getToken).then(data => setJobs(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    reload()
      .catch(() => { /* stale list is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, getToken])

  usePolling(() => { reload().catch(() => {}) }, POLL_INTERVAL_MS, isLoaded && isSignedIn)

  return { jobs, loading, reload }
}
