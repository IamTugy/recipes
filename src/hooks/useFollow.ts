import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

// Tracks whether the signed-in viewer follows a given chef - the follower
// COUNT itself comes from the public chef-profile endpoint (useChefProfile),
// since that's visible to signed-out viewers too; this hook only owns the
// viewer-specific "am I following" boolean and the toggle action.
export function useFollow(chefUserId: string | undefined) {
  const { getToken, isLoaded, isSignedIn, userId: currentUserId } = useAuth()
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !chefUserId) return
    let cancelled = false

    apiFetch<{ following: boolean; followerCount: number }>(`/follows/${chefUserId}/status`, getToken)
      .then(data => { if (!cancelled) setFollowing(data.following) })
      .catch(() => { /* follow status is a nice-to-have, fail silently */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, chefUserId, getToken])

  const toggle = useCallback(async () => {
    if (!chefUserId || !isSignedIn) return
    const wasFollowing = following
    setFollowing(!wasFollowing)

    const token = await getToken()
    const res = await fetch(`/api/follows/${chefUserId}`, {
      method: wasFollowing ? 'DELETE' : 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    if (!res.ok) setFollowing(wasFollowing)
    return res.ok
  }, [chefUserId, isSignedIn, following, getToken])

  return { following, toggle, loading: loading || !isLoaded, isSelf: !!currentUserId && currentUserId === chefUserId }
}
