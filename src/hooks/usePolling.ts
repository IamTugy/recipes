import { useEffect, useRef } from 'react'

// Polls `callback` on an interval while the tab is visible - a backgrounded
// tab wastes requests on data the user isn't looking at. Also fires once
// immediately on returning to the foreground, so a view isn't stale right
// after the user tabs back in.
export function usePolling(callback: () => void, intervalMs: number, enabled = true): void {
  const callbackRef = useRef(callback)
  useEffect(() => { callbackRef.current = callback }, [callback])

  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') callbackRef.current()
    }, intervalMs)

    function handleVisibility() {
      if (document.visibilityState === 'visible') callbackRef.current()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [intervalMs, enabled])
}
