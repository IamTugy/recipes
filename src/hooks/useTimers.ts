import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import type { TimerState } from '../types'
import { ensurePushSubscription, syncTimerStart, syncTimerRemoved } from '../lib/push'

const SESSION_KEY = 'recipe-timers'
let timerIdCounter = 0

function saveTimers(timers: TimerState[]) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(timers))
  } catch { /* localStorage unavailable */ }
}

// Recompute remaining/done from wall-clock time (endsAt) rather than trusting
// a stored countdown - background tabs/PWAs get throttled or fully suspended,
// so a plain per-tick decrement understates how much time actually passed.
function resolveTimer(t: TimerState): TimerState {
  if (t.done || !t.running) return t
  const endsAt = t.endsAt ?? (Date.now() + t.remainingSeconds * 1000)
  const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  const done = remaining === 0
  return { ...t, remainingSeconds: remaining, done, running: !done, endsAt }
}

function loadTimers(): TimerState[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as TimerState[]).map(resolveTimer)
  } catch { return [] }
}

export function useTimers() {
  const { getToken } = useAuth()
  const [timers, setTimers] = useState<TimerState[]>(loadTimers)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const tick = useCallback((id: string) => {
    setTimers(prev => {
      const next = prev.map(t => {
        if (t.id !== id || !t.running) return t
        const resolved = resolveTimer(t)
        if (resolved.done) {
          clearInterval(intervalsRef.current.get(id))
          intervalsRef.current.delete(id)
          // Natural completion, seen in the foreground - delete the
          // server-side row so the sweep never sends a redundant push for
          // a timer the owner has already watched finish.
          void syncTimerRemoved(getToken, id)
        }
        return resolved
      })
      saveTimers(next)
      return next
    })
  }, [getToken])

  // Restart intervals for timers that were running when restored from session
  useEffect(() => {
    timers.forEach(t => {
      if (t.running && !t.done && !intervalsRef.current.has(t.id)) {
        const interval = setInterval(() => tick(t.id), 1000)
        intervalsRef.current.set(t.id, interval)
        // Update counter to avoid ID collisions
        const num = parseInt(t.id.replace('timer-', ''), 10)
        if (!isNaN(num) && num > timerIdCounter) timerIdCounter = num
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A backgrounded/suspended tab's setInterval may not fire at all until the
  // tab is foregrounded again - resync from wall-clock time the instant it is,
  // rather than waiting for the next 1s tick.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      setTimers(prev => {
        const next = prev.map(resolveTimer)
        saveTimers(next)
        return next
      })
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const addTimer = useCallback((label: string, minutes: number, recipeId: string, stepIndex: number) => {
    const id = `timer-${++timerIdCounter}`
    const totalSeconds = minutes * 60
    const endsAt = Date.now() + totalSeconds * 1000
    setTimers(prev => {
      const next = [...prev, {
        id, label, totalSeconds, remainingSeconds: totalSeconds,
        running: true, done: false, recipeId, stepIndex,
        endsAt,
      }]
      saveTimers(next)
      return next
    })
    const interval = setInterval(() => tick(id), 1000)
    intervalsRef.current.set(id, interval)
    // Fire-and-forget, same tolerance-for-failure posture as this app's
    // activityLog.record() calls - a denied permission or failed sync just
    // means no background push for this timer, never a broken timer.
    void ensurePushSubscription(getToken).then(() => syncTimerStart(getToken, id, recipeId, label, endsAt))
  }, [tick, getToken])

  const toggleTimer = useCallback((id: string) => {
    setTimers(prev => {
      const next = prev.map(t => {
        if (t.id !== id || t.done) return t
        if (t.running) {
          clearInterval(intervalsRef.current.get(id))
          intervalsRef.current.delete(id)
          const resolved = resolveTimer(t)
          // Paused - there's no valid endsAt to sweep for anymore, so the
          // server-side row (if any) must go too, or the sweep would fire
          // a push for a timer the owner deliberately stopped.
          void syncTimerRemoved(getToken, id)
          return { ...resolved, running: false, endsAt: undefined }
        } else {
          const interval = setInterval(() => tick(id), 1000)
          intervalsRef.current.set(id, interval)
          const endsAt = Date.now() + t.remainingSeconds * 1000
          void syncTimerStart(getToken, id, t.recipeId, t.label, endsAt)
          return { ...t, running: true, endsAt }
        }
      })
      saveTimers(next)
      return next
    })
  }, [tick, getToken])

  const removeTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    void syncTimerRemoved(getToken, id)
    setTimers(prev => {
      const next = prev.filter(t => t.id !== id)
      saveTimers(next)
      return next
    })
  }, [getToken])

  const resetTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    void syncTimerRemoved(getToken, id)
    setTimers(prev => {
      const next = prev.map(t =>
        t.id !== id ? t : { ...t, remainingSeconds: t.totalSeconds, running: false, done: false, endsAt: undefined }
      )
      saveTimers(next)
      return next
    })
  }, [getToken])

  useEffect(() => {
    const intervals = intervalsRef.current
    return () => { intervals.forEach(i => clearInterval(i)) }
  }, [])

  return { timers, addTimer, toggleTimer, removeTimer, resetTimer }
}
