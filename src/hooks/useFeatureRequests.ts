import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'
import { usePolling } from './usePolling'

const POLL_INTERVAL_MS = 30_000

export interface FeatureRequest {
  number: number
  title: string
  body: string
  htmlUrl: string
  state: string
  labels: string[]
  createdAt: string
  submittedBy: string | null
  denialReason: string | null
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

  // Status (approved/denied/in-progress/pr-open/closed) is driven by a
  // background worker + Claude agent acting on the GitHub issue, not by
  // anything this tab does - poll so it shows up without a manual refresh.
  usePolling(load, POLL_INTERVAL_MS, isLoaded && isSignedIn)

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
    if (res.ok) {
      const created: FeatureRequest = await res.json()
      setRequests(prev => [created, ...prev])
    }
    return res.ok
  }, [getToken])

  const approve = useCallback(async (number: number) => {
    setRequests(prev => prev.map(r => (
      r.number === number ? { ...r, labels: [...r.labels, 'approved-for-claude'] } : r
    )))
    const token = await getToken()
    const res = await fetch(`/api/feature-requests/${number}/approve`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      setRequests(prev => prev.map(r => (
        r.number === number ? { ...r, labels: r.labels.filter(l => l !== 'approved-for-claude') } : r
      )))
    }
    return res.ok
  }, [getToken])

  const unapprove = useCallback(async (number: number) => {
    setRequests(prev => prev.map(r => (
      r.number === number ? { ...r, labels: r.labels.filter(l => l !== 'approved-for-claude') } : r
    )))
    const token = await getToken()
    const res = await fetch(`/api/feature-requests/${number}/unapprove`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      setRequests(prev => prev.map(r => (
        r.number === number ? { ...r, labels: [...r.labels, 'approved-for-claude'] } : r
      )))
    }
    return res.ok
  }, [getToken])

  const update = useCallback(async (number: number, title: string, description: string) => {
    const token = await getToken()
    const res = await fetch(`/api/feature-requests/${number}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title, description }),
    })
    if (res.ok) {
      const updated: FeatureRequest = await res.json()
      setRequests(prev => prev.map(r => (r.number === number ? updated : r)))
    }
    return res.ok
  }, [getToken])

  const withdraw = useCallback(async (number: number) => {
    const token = await getToken()
    const res = await fetch(`/api/feature-requests/${number}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.number !== number))
    }
    return res.ok
  }, [getToken])

  const deny = useCallback(async (number: number, reason: string) => {
    setRequests(prev => prev.map(r => (
      r.number === number ? { ...r, labels: [...r.labels, 'denied'], denialReason: reason } : r
    )))
    const token = await getToken()
    const res = await fetch(`/api/feature-requests/${number}/deny`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) {
      setRequests(prev => prev.map(r => (
        r.number === number ? { ...r, labels: r.labels.filter(l => l !== 'denied'), denialReason: null } : r
      )))
    }
    return res.ok
  }, [getToken])

  return { requests, loading, create, approve, unapprove, update, withdraw, deny }
}
