import { useCallback, useEffect, useRef, useState } from 'react'
import type { TimerState } from '../types'

const SESSION_KEY = 'recipe-timers'
let timerIdCounter = 0

function saveTimers(timers: TimerState[]) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      timers,
      savedAt: Date.now(),
    }))
  } catch {}
}

function loadTimers(): TimerState[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.timers) || typeof parsed?.savedAt !== 'number') return []
    const { timers, savedAt } = parsed as { timers: TimerState[], savedAt: number }
    const elapsedSeconds = Math.floor((Date.now() - savedAt) / 1000)
    return timers.map(t => {
      if (t.done || !t.running) return t
      const remaining = Math.max(0, t.remainingSeconds - elapsedSeconds)
      const done = remaining === 0
      return { ...t, remainingSeconds: remaining, done, running: !done }
    })
  } catch { return [] }
}

export function useTimers() {
  const [timers, setTimers] = useState<TimerState[]>(loadTimers)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const tick = useCallback((id: string) => {
    setTimers(prev => {
      const next = prev.map(t => {
        if (t.id !== id || !t.running) return t
        if (t.remainingSeconds <= 1) {
          clearInterval(intervalsRef.current.get(id))
          intervalsRef.current.delete(id)
          return { ...t, remainingSeconds: 0, running: false, done: true }
        }
        return { ...t, remainingSeconds: t.remainingSeconds - 1 }
      })
      saveTimers(next)
      return next
    })
  }, [])

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

  const addTimer = useCallback((label: string, minutes: number, recipeId: string, stepIndex: number) => {
    const id = `timer-${++timerIdCounter}`
    const totalSeconds = minutes * 60
    setTimers(prev => {
      const next = [...prev, {
        id, label, totalSeconds, remainingSeconds: totalSeconds,
        running: true, done: false, recipeId, stepIndex,
      }]
      saveTimers(next)
      return next
    })
    const interval = setInterval(() => tick(id), 1000)
    intervalsRef.current.set(id, interval)
  }, [tick])

  const toggleTimer = useCallback((id: string) => {
    setTimers(prev => {
      const next = prev.map(t => {
        if (t.id !== id || t.done) return t
        if (t.running) {
          clearInterval(intervalsRef.current.get(id))
          intervalsRef.current.delete(id)
          return { ...t, running: false }
        } else {
          const interval = setInterval(() => tick(id), 1000)
          intervalsRef.current.set(id, interval)
          return { ...t, running: true }
        }
      })
      saveTimers(next)
      return next
    })
  }, [tick])

  const removeTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    setTimers(prev => {
      const next = prev.filter(t => t.id !== id)
      saveTimers(next)
      return next
    })
  }, [])

  const resetTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    setTimers(prev => {
      const next = prev.map(t =>
        t.id !== id ? t : { ...t, remainingSeconds: t.totalSeconds, running: false, done: false }
      )
      saveTimers(next)
      return next
    })
  }, [])

  useEffect(() => {
    return () => { intervalsRef.current.forEach(i => clearInterval(i)) }
  }, [])

  return { timers, addTimer, toggleTimer, removeTimer, resetTimer }
}
