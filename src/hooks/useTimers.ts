import { useCallback, useEffect, useRef, useState } from 'react'
import type { TimerState } from '../types'

let timerIdCounter = 0

export function useTimers() {
  const [timers, setTimers] = useState<TimerState[]>([])
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const tick = useCallback((id: string) => {
    setTimers(prev => prev.map(t => {
      if (t.id !== id || !t.running) return t
      if (t.remainingSeconds <= 1) {
        clearInterval(intervalsRef.current.get(id))
        intervalsRef.current.delete(id)
        return { ...t, remainingSeconds: 0, running: false, done: true }
      }
      return { ...t, remainingSeconds: t.remainingSeconds - 1 }
    }))
  }, [])

  const addTimer = useCallback((label: string, minutes: number, recipeId: string, stepIndex: number) => {
    const id = `timer-${++timerIdCounter}`
    const totalSeconds = minutes * 60
    setTimers(prev => [...prev, {
      id, label, totalSeconds, remainingSeconds: totalSeconds,
      running: true, done: false, recipeId, stepIndex,
    }])
    const interval = setInterval(() => tick(id), 1000)
    intervalsRef.current.set(id, interval)
  }, [tick])

  const toggleTimer = useCallback((id: string) => {
    setTimers(prev => prev.map(t => {
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
    }))
  }, [tick])

  const removeTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    setTimers(prev => prev.filter(t => t.id !== id))
  }, [])

  const resetTimer = useCallback((id: string) => {
    clearInterval(intervalsRef.current.get(id))
    intervalsRef.current.delete(id)
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t
      return { ...t, remainingSeconds: t.totalSeconds, running: false, done: false }
    }))
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intervalsRef.current.forEach(interval => clearInterval(interval))
    }
  }, [])

  return { timers, addTimer, toggleTimer, removeTimer, resetTimer }
}
