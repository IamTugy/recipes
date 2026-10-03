import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { ApiError } from '../lib/api'
import { cookTogetherApi, joinCodeFromSearch, type CookTogetherRoom } from '../lib/cookTogether'
import { useLanguage } from './useLanguage'
import { usePolling } from './usePolling'
import { useToast } from './useToast'
import { t } from '../i18n'

const POLL_INTERVAL_MS = 3000

// Global, App.tsx-owned cook-together room - same idea as useCookSession: one
// instance for the whole app so the Nav button, the recipe page and the
// panel all see the same room. The server owns everything (plan, estimates,
// who does what); this hook just keeps a fresh copy and sends actions.
export function useCookTogether() {
  const { getToken, userId, isSignedIn } = useAuth()
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const tx = t[lang]

  const [room, setRoom] = useState<CookTogetherRoom | null>(null)
  // When the current `room` snapshot arrived, on THIS device's clock - the
  // panel counts the ETA down from it, which stays right even if the
  // device clock disagrees with the server's.
  const [receivedAt, setReceivedAt] = useState(() => Date.now())
  const [panelOpen, setPanelOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Bumped on every local action so a slow poll that started before it can't
  // land afterwards and overwrite the newer state with an older snapshot.
  const mutationVersionRef = useRef(0)
  const roomCodeRef = useRef<string | null>(null)

  const adopt = useCallback((next: CookTogetherRoom | null) => {
    roomCodeRef.current = next?.code ?? null
    setRoom(next)
    setReceivedAt(Date.now())
  }, [])

  const reportError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 404) return showToast(tx.ctRoomNotFound, 'error')
      if (err.status === 409) return showToast(tx.ctConflict, 'error')
      if (err.status === 400 || err.status === 403) return showToast(err.message, 'error')
    }
    showToast(tx.ctGenericError, 'error')
  }, [showToast, tx])

  // Runs a room-returning action, adopting its result. Resolves to whether it worked.
  const run = useCallback(async (action: () => Promise<CookTogetherRoom>): Promise<boolean> => {
    mutationVersionRef.current++
    setBusy(true)
    try {
      adopt(await action())
      return true
    } catch (err) {
      reportError(err)
      return false
    } finally {
      setBusy(false)
    }
  }, [adopt, reportError])

  // Pick up a room the user is already in (reload, another device).
  useEffect(() => {
    if (!isSignedIn || !userId) return
    let cancelled = false
    cookTogetherApi.current(getToken).then(current => {
      if (!cancelled && current) adopt(current)
    }).catch(() => { /* best-effort - no room found is fine */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render; this must only re-run when the signed-in user changes
  }, [isSignedIn, userId, adopt])

  usePolling(() => {
    const code = roomCodeRef.current
    if (!code) return
    const version = mutationVersionRef.current
    cookTogetherApi.get(code, getToken).then(next => {
      if (mutationVersionRef.current === version && roomCodeRef.current === code) adopt(next)
    }).catch(err => {
      if (mutationVersionRef.current !== version || roomCodeRef.current !== code) return
      // The room is gone (host ended it) or we were removed from it.
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        adopt(null)
        setPanelOpen(false)
        showToast(tx.ctRoomEnded, 'info')
      }
      // Anything else is a transient network problem - try again next tick.
    })
  }, POLL_INTERVAL_MS, !!room)

  const join = useCallback(async (code: string): Promise<boolean> => {
    const ok = await run(() => cookTogetherApi.join(code.trim().toUpperCase(), getToken))
    if (ok) setPanelOpen(true)
    return ok
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render
  }, [run])

  // A share link (?cook=CODE) joins straight away once signed in.
  const joinFromSearch = useCallback((search: string) => {
    const code = joinCodeFromSearch(search)
    if (!code) return false
    void join(code)
    return true
  }, [join])

  useEffect(() => {
    if (!isSignedIn) return
    if (joinFromSearch(window.location.search)) {
      const params = new URLSearchParams(window.location.search)
      params.delete('cook')
      const search = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
    }
  }, [isSignedIn, joinFromSearch])

  const code = room?.code

  return {
    room, receivedAt, panelOpen, busy,
    openPanel: () => setPanelOpen(true),
    closePanel: () => setPanelOpen(false),
    join,
    joinFromSearch,
    create: async (recipeId: string): Promise<boolean> => {
      const ok = await run(() => cookTogetherApi.create(recipeId, getToken))
      if (ok) setPanelOpen(true)
      return ok
    },
    start: () => code ? run(() => cookTogetherApi.start(code, getToken)) : Promise.resolve(false),
    resplit: () => code ? run(() => cookTogetherApi.resplit(code, getToken)) : Promise.resolve(false),
    finish: () => code ? run(() => cookTogetherApi.finish(code, getToken)) : Promise.resolve(false),
    startTask: (taskId: string) => code ? run(() => cookTogetherApi.startTask(code, taskId, getToken)) : Promise.resolve(false),
    completeTask: (taskId: string) => code ? run(() => cookTogetherApi.completeTask(code, taskId, getToken)) : Promise.resolve(false),
    claimTask: (taskId: string) => code ? run(() => cookTogetherApi.claimTask(code, taskId, getToken)) : Promise.resolve(false),
    reopenTask: (taskId: string) => code ? run(() => cookTogetherApi.reopenTask(code, taskId, getToken)) : Promise.resolve(false),
    leave: async () => {
      if (!code) return
      mutationVersionRef.current++
      setBusy(true)
      try {
        await cookTogetherApi.leave(code, getToken)
        adopt(null)
        setPanelOpen(false)
      } catch (err) {
        reportError(err)
      } finally {
        setBusy(false)
      }
    },
    cancel: async () => {
      if (!code) return
      mutationVersionRef.current++
      setBusy(true)
      try {
        await cookTogetherApi.cancel(code, getToken)
        adopt(null)
        setPanelOpen(false)
      } catch (err) {
        reportError(err)
      } finally {
        setBusy(false)
      }
    },
  }
}
