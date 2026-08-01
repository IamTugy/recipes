import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface FeatureRequest {
  number: number
  title: string
  body: string
  htmlUrl: string
  state: string
  labels: string[]
  createdAt: string
}

export function useFeatureRequests() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn) return
    apiFetch<FeatureRequest[]>('/feature-requests', getToken)
      .then(data => setRequests(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (title: string, description: string) => {
    const token = await getToken()
    const res = await fetch('/api/feature-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title, description }),
    })
    if (res.ok) load()
    return res.ok
  }, [getToken, load])

  const approve = useCallback(async (number: number) => {
    const token = await getToken()
    const res = await fetch(`/api/feature-requests/${number}/approve`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.ok) load()
    return res.ok
  }, [getToken, load])

  return { requests, loading, create, approve }
}
