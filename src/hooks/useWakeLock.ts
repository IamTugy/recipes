import { useCallback, useEffect, useRef, useState } from 'react'

export function useWakeLock() {
  const [active, setActive] = useState(false)
  const sentinelRef = useRef<WakeLockSentinel | null>(null)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  const release = useCallback(async () => {
    if (sentinelRef.current && !sentinelRef.current.released) {
      await sentinelRef.current.release()
    }
    sentinelRef.current = null
    setActive(false)
  }, [])

  const request = useCallback(async () => {
    if (!supported) return
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => setActive(false))
      sentinelRef.current = sentinel
      setActive(true)
    } catch {
      setActive(false)
    }
  }, [supported])

  const toggle = useCallback(() => {
    if (active) void release()
    else void request()
  }, [active, release, request])

  // Re-acquire if the tab regains visibility while the user left it active
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && sentinelRef.current === null && active) {
        void request()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [active, request])

  useEffect(() => () => { void release() }, [release])

  return { active, supported, toggle }
}
