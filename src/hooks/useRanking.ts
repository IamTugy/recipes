import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export interface LeaderboardEntry {
  userId: string
  name: string | null
  points: number
  rank: number
}

export function useLeaderboard(limit = 20) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!isLoaded || !isSignedIn) return
    apiFetch<LeaderboardEntry[]>(`/ranking/leaderboard?limit=${limit}`, getToken)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, getToken, limit])

  useEffect(() => { load() }, [load])

  return { entries, loading }
}

export function useMyPoints() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth()
  const [points, setPoints] = useState<number | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    apiFetch<{ userId: string; points: number }>('/ranking/me', getToken).then(res => setPoints(res.points))
  }, [isLoaded, isSignedIn, getToken, userId])

  return points
}
