import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface AppNotification {
  id: string
  type: 'new_follower'
  actorId: string
  actorName: string | null
  actorImageUrl: string | null
  read: boolean
  createdAt: string
}

const POLL_INTERVAL_MS = 60000

// Polls the unread count in the background (cheap - a single count query)
// so the bell badge stays fresh without the user opening the dropdown;
// the full notification list is only fetched on demand, when they do.
export function useNotifications() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)

  const refreshUnreadCount = useCallback(() => {
    if (!isSignedIn) return
    apiFetch<{ count: number }>('/notifications/unread-count', getToken)
      .then(data => setUnreadCount(data.count))
      .catch(() => { /* stale badge is a minor annoyance, not worth surfacing an error for */ })
  }, [isSignedIn, getToken])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    refreshUnreadCount()
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isLoaded, isSignedIn, refreshUnreadCount])

  const loadNotifications = useCallback(() => {
    setLoading(true)
    apiFetch<AppNotification[]>('/notifications', getToken)
      .then(data => setNotifications(data))
      .catch(() => { /* empty list on failure is an acceptable fallback for a nice-to-have dropdown */ })
      .finally(() => setLoading(false))
  }, [getToken])

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
    const token = await getToken()
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => { /* best-effort - refreshUnreadCount will reconcile on the next poll */ })
  }, [getToken])

  return { unreadCount, notifications, loading, loadNotifications, markAllRead }
}
