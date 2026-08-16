import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import type { Recipe, TimerState } from '../types'
import { useRecipe } from './useRecipes'
import { useWakeLock } from './useWakeLock'
import type { CookDockFlatStep } from '../components/CookDock'
import type { BackgroundCookStatusHandle } from '../components/BackgroundCookStatus'
import {
  startCookSession, logCookSessionStep, finishCookSession, abandonCookSession,
  getActiveCookSession, syncCookSession, getCurrentCookSession,
} from '../lib/cookSessions'

function sameStringSet(a: string[], b: Set<string>): boolean {
  if (a.length !== b.size) return false
  return a.every(item => b.has(item))
}

type Lang = 'he' | 'en'

// Global, App.tsx-owned cook session - mirrors the useTimers()/TimerPanel
// pattern so the dock, the PiP/OS-notification hand-off, and the wake lock
// all keep working regardless of which page is currently showing.
export function useCookSession(
  lang: Lang,
  timers: TimerState[],
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void,
  onToggleTimer: (id: string) => void,
) {
  const { getToken, userId: currentUserId } = useAuth()

  const [activeRecipeId, setActiveRecipeId] = useState<string | undefined>(undefined)
  // Seeds recipe data synchronously from whatever RecipeDetail already had
  // loaded at the moment "Start cooking" was clicked, so the very first
  // startCookingNow() call has ingredients/steps to work with before
  // useRecipe(activeRecipeId)'s own fetch has had a chance to resolve.
  const [seedRecipe, setSeedRecipe] = useState<Recipe | null>(null)
  const { recipe: fetchedRecipe, notFound: activeRecipeNotFound } = useRecipe(activeRecipeId)
  // useRecipe(id) never clears its own recipe state when id changes - it
  // only overwrites it once a new fetch resolves - so fetchedRecipe can
  // still hold the PREVIOUS activeRecipeId's recipe for a full round-trip
  // (or forever, on fetch failure) after switching recipes. Check identity
  // explicitly instead of trusting fetch-resolution ordering via `??`.
  const recipe = fetchedRecipe?.id === activeRecipeId
    ? fetchedRecipe
    : seedRecipe?.id === activeRecipeId
      ? seedRecipe
      : undefined

  const [cookSessionActive, setCookSessionActive] = useState(false)
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [totalPausedMs, setTotalPausedMs] = useState(0)
  // Backs pausedAt for resumeIfPaused's idempotency check - several call
  // sites (Next, Mark done, PiP prev/next) invoke resumeIfPaused more than
  // once within a single synchronous handler, and all of those calls would
  // see the same stale `pausedAt` state value in their closure. Clearing
  // this ref synchronously on the first call makes every later call in the
  // same tick a no-op instead of double/triple-counting the paused duration.
  const pausedAtRef = useRef<number | null>(null)
  const [startDockExpanded, setStartDockExpanded] = useState(false)
  const [cookConflict, setCookConflict] = useState<{ sessionId: string; recipeTitle: string } | null>(null)
  const [resolvingCookConflict, setResolvingCookConflict] = useState(false)
  const [startingCook, setStartingCook] = useState(false)
  const [wizardIndex, setWizardIndex] = useState(0)
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const [multiplier, setMultiplier] = useState(1)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  // Set when a session finishes naturally (last step reached), so whichever
  // page is showing that recipe can offer the post-cook review nudge -
  // cleared by the consumer once it has acted on it.
  const [justFinishedRecipeId, setJustFinishedRecipeId] = useState<string | null>(null)

  const pendingCookStepRef = useRef<{ stepKey: string; stepNum: number } | null>(null)
  const lastEnteredStepRef = useRef<{ stepKey: string; stepNum: number }>({ stepKey: 'checklist', stepNum: 0 })
  const suppressNextCheckedSyncRef = useRef(false)
  const checkedStepsRef = useRef(checkedSteps)
  const checkedIngredientsRef = useRef(checkedIngredients)
  const wizardIndexRef = useRef(wizardIndex)
  const discoveryRequestIdRef = useRef(0)
  // Counts consecutive `null` responses from the 5s poll - a single null
  // could just be a transient network hiccup, but two in a row means the
  // server has confirmed (for ~10s) there's no active session left, so it's
  // safe to tear down local state. Reset whenever a new session starts.
  const consecutiveNullPollsRef = useRef(0)
  const backgroundCookStatusRef = useRef<BackgroundCookStatusHandle>(null)

  useEffect(() => { checkedStepsRef.current = checkedSteps }, [checkedSteps])
  useEffect(() => { checkedIngredientsRef.current = checkedIngredients }, [checkedIngredients])
  useEffect(() => { wizardIndexRef.current = wizardIndex }, [wizardIndex])

  const cookMode = useWakeLock()

  let _n = 0
  const stepNums = (recipe?.steps ?? []).map(g => g.items.map(() => ++_n))
  const flatSteps: CookDockFlatStep[] = (recipe?.steps ?? []).flatMap((group, gi) =>
    group.items.map((step, si) => ({
      groupIdx: gi,
      stepIdx: si,
      stepNum: stepNums[gi][si],
      instruction: lang === 'he' ? step.instruction : (step.instructionEn ?? step.instruction),
      instructionHe: step.instruction,
      instructionEn: step.instructionEn,
      tip: lang === 'he' ? step.tip : (step.tipEn ?? step.tip),
      timerMinutes: step.timerMinutes,
      image: step.image,
    }))
  )

  const recipeTimers = timers.filter(t => t.recipeId === recipe?.id && !t.done)
  const runningRecipeTimers = recipeTimers.filter(t => t.running)
  const nearestTimer = (runningRecipeTimers.length > 0 ? runningRecipeTimers : recipeTimers)
    .slice().sort((a, b) => a.remainingSeconds - b.remainingSeconds)[0] ?? null

  const currentWizardStep = cookSessionActive ? flatSteps[wizardIndex] : undefined
  const wizardStepLabel = lang === 'he'
    ? `שלב ${wizardIndex + 1} מתוך ${flatSteps.length}`
    : `Step ${wizardIndex + 1} of ${flatSteps.length}`

  // The one timer CookDock actually displays (its own step's timer if it
  // has a non-done one, else the recipe-wide nearest) - the single source
  // of truth both CookDock's own display and TimerPanel's exclusion filter
  // read, so the two can never drift apart or leave a timer visible nowhere.
  const dockDisplayedTimer = (() => {
    if (!currentWizardStep) return nearestTimer
    const stepOwnTimer = getTimerForStep(currentWizardStep.groupIdx, currentWizardStep.stepIdx)
    return (stepOwnTimer && !stepOwnTimer.done) ? stepOwnTimer : nearestTimer
  })()
  const dockDisplayedTimerId = dockDisplayedTimer?.id ?? null

  function toggleStep(key: string) {
    resumeIfPaused()
    setCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function markStepChecked(key: string) {
    resumeIfPaused()
    setCheckedSteps(prev => {
      if (prev.has(key)) return prev
      return new Set(prev).add(key)
    })
  }

  function toggleIngredient(key: string) {
    resumeIfPaused()
    setCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function getTimerForStep(groupIdx: number, stepIdx: number) {
    const key = groupIdx * 10000 + stepIdx
    return timers.find(t => t.recipeId === recipe?.id && t.stepIndex === key)
  }

  function startTimer(label: string, minutes: number, groupIdx: number, stepIdx: number) {
    resumeIfPaused()
    if (!recipe) return
    onAddTimer(label, minutes, recipe.id, groupIdx * 10000 + stepIdx)
  }

  // Resets all active-session state to its inactive defaults. Called from
  // stopCooking (a deliberate Stop, which also needs to notify the server),
  // the notFound self-heal effect and the consecutive-null-poll handler
  // below (both cases where the server has already lost the session, so
  // there's nothing left to abandon), and the finish branch of
  // advanceWizardOrFinish (which calls finishCookSession separately, so it
  // never abandons here either).
  function endSessionLocally(alsoAbandon: boolean) {
    // Invalidate any in-flight discoverActiveSession call so its eventual
    // resolution can't resurrect the session we're tearing down here - see
    // discoverActiveSession's own race guard, which checks this same ref.
    discoveryRequestIdRef.current++
    if (alsoAbandon && cookSessionId) {
      abandonCookSession(cookSessionId, getToken)
    }
    setCookSessionActive(false)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
    setActiveRecipeId(undefined)
    setSeedRecipe(null)
    setPausedAt(null)
    setTotalPausedMs(0)
    pausedAtRef.current = null
  }

  function pauseCooking() {
    if (pausedAtRef.current !== null) return
    const now = Date.now()
    pausedAtRef.current = now
    setPausedAt(now)
  }

  // Also called internally (not just from an explicit "Continue" click) by
  // every interaction handler below, so any dock/page/PiP interaction while
  // paused implicitly resumes the elapsed-time clock. No-op when not paused.
  // Reads/clears the ref (not the pausedAt state) so that multiple calls
  // within the same synchronous handler (e.g. Next triggers both
  // handleStepEntered and markStepChecked, each calling this) only count
  // the paused duration once - the second call sees the ref already null.
  function resumeIfPaused() {
    const at = pausedAtRef.current
    if (at === null) return
    pausedAtRef.current = null
    setTotalPausedMs(ms => ms + (Date.now() - at))
    setPausedAt(null)
  }

  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      const finishedRecipeId = activeRecipeId
      if (cookSessionId) {
        finishCookSession(cookSessionId, getToken)
      }
      endSessionLocally(false)
      if (currentUserId && finishedRecipeId) setJustFinishedRecipeId(finishedRecipeId)
    } else {
      setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
    }
  }

  function handleWizardMarkDone(key: string) {
    if (checkedSteps.has(key)) {
      toggleStep(key)
      return
    }
    markStepChecked(key)
    advanceWizardOrFinish()
  }

  function handleStepEntered(stepKey: string, stepNum: number) {
    resumeIfPaused()
    lastEnteredStepRef.current = { stepKey, stepNum }
    if (!cookSessionId) {
      pendingCookStepRef.current = { stepKey, stepNum }
      return
    }
    // No suppressNextCheckedSyncRef set here: this function never itself
    // calls setCheckedSteps/setCheckedIngredients, so the checked-state-sync
    // effect (deps [checkedSteps, checkedIngredients]) won't fire from this
    // call alone - setting the flag here would just leave it stuck true
    // until some later, unrelated checked-state change silently swallows it.
    logCookSessionStep(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
  }

  // seed is whatever recipe RecipeDetail already had loaded - see the
  // seedRecipe comment above for why this can't wait for useRecipe's fetch.
  // initialCheckedSteps/initialCheckedIngredients are RecipeDetail's own
  // local checklist state at the moment "Start cooking" was clicked - the
  // hook's own checkedSteps/checkedIngredients state hasn't been touched
  // for this recipe yet (and may still hold stale state from a previous
  // cook), so we must seed from what the page actually has rather than
  // read our own state.
  function startCookingNow(
    seed: Recipe,
    initialMultiplier: number,
    initialCheckedSteps: Set<string>,
    initialCheckedIngredients: Set<string>,
  ) {
    setCheckedSteps(new Set(initialCheckedSteps))
    setCheckedIngredients(new Set(initialCheckedIngredients))

    let n = 0
    const localStepNums: number[][] = seed.steps.map(g => g.items.map(() => ++n))
    const localFlatSteps = seed.steps.flatMap((group, gi) =>
      group.items.map((_step, si) => ({ groupIdx: gi, stepIdx: si, stepNum: localStepNums[gi][si] }))
    )
    const firstUnchecked = localFlatSteps.findIndex(s => !initialCheckedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    const startIndex = firstUnchecked === -1 ? 0 : firstUnchecked

    setSeedRecipe(seed)
    setActiveRecipeId(seed.id)
    setMultiplier(initialMultiplier)
    setWizardIndex(startIndex)
    setCookSessionActive(true)
    setStartDockExpanded(true)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
    pendingCookStepRef.current = null
    lastEnteredStepRef.current = { stepKey: 'checklist', stepNum: 0 }

    if (currentUserId) {
      startCookSession(seed.id, getToken).then(sessionId => {
        setCookSessionId(sessionId)
        if (!sessionId) return
        const allIngredientsChecked = seed.ingredients.every((group, gi) =>
          group.items.every((_, ii) => initialCheckedIngredients.has(`${gi}-${ii}`))
        )
        const initialStep = localFlatSteps[startIndex]
        if (allIngredientsChecked && initialStep) {
          const stepKey = `${initialStep.groupIdx}-${initialStep.stepIdx}`
          lastEnteredStepRef.current = { stepKey, stepNum: initialStep.stepNum }
          logCookSessionStep(sessionId, stepKey, initialStep.stepNum, [...initialCheckedSteps], [...initialCheckedIngredients], getToken)
        } else if (pendingCookStepRef.current) {
          const { stepKey, stepNum } = pendingCookStepRef.current
          pendingCookStepRef.current = null
          logCookSessionStep(sessionId, stepKey, stepNum, [...initialCheckedSteps], [...initialCheckedIngredients], getToken)
        }
      })
    }
  }

  async function startCookingWithConflictCheck(
    seed: Recipe,
    initialMultiplier: number,
    initialCheckedSteps: Set<string>,
    initialCheckedIngredients: Set<string>,
  ) {
    try {
      if (currentUserId) {
        const current = await getCurrentCookSession(getToken)
        if (current && current.recipeId === seed.id) {
          // Same recipe already has an active session elsewhere - adopt it
          // instead of minting a duplicate (that would leave two live
          // sessions fighting over state). Seed the recipe data up front
          // since discoverActiveSession itself doesn't (see the notFound
          // self-heal effect for why that matters).
          setSeedRecipe(seed)
          const discoveryResult = await discoverActiveSession(seed.id)
          if (discoveryResult === 'resumed') {
            setMultiplier(initialMultiplier)
            setStartDockExpanded(true)
            return
          }
          if (discoveryResult === 'discarded') {
            // The discovery fetch was raced away (e.g. endSessionLocally
            // bumped discoveryRequestIdRef while it was in flight) or was
            // never attempted (no user / cross-recipe guard) - the state is
            // ambiguous, and there may still be a live session out there.
            // Do nothing rather than risk starting a fresh session that
            // silently overwrites/destroys it; the user can just click
            // "Start cooking" again.
            return
          }
          // discoveryResult === 'none': the server genuinely confirmed there
          // is no active session for this recipe (the earlier
          // getCurrentCookSession conflict check may have seen one that
          // ended in the brief window before this fetch, e.g. another
          // device raced a Stop) - safe to fall through to a fresh session.
          startCookingNow(seed, initialMultiplier, initialCheckedSteps, initialCheckedIngredients)
          return
        }
        if (current && current.recipeId !== seed.id) {
          setCookConflict({ sessionId: current.sessionId, recipeTitle: current.recipeTitle })
          return
        }
      }
      startCookingNow(seed, initialMultiplier, initialCheckedSteps, initialCheckedIngredients)
    } finally {
      setStartingCook(false)
    }
  }

  function openWizard(
    seed: Recipe,
    initialMultiplier: number,
    initialCheckedSteps: Set<string>,
    initialCheckedIngredients: Set<string>,
  ) {
    if (cookSessionActive || startingCook) return
    setStartingCook(true)
    void startCookingWithConflictCheck(seed, initialMultiplier, initialCheckedSteps, initialCheckedIngredients)
  }

  async function confirmStartNewCook(
    seed: Recipe,
    initialMultiplier: number,
    initialCheckedSteps: Set<string>,
    initialCheckedIngredients: Set<string>,
  ) {
    if (!cookConflict) return
    setResolvingCookConflict(true)
    await abandonCookSession(cookConflict.sessionId, getToken)
    setResolvingCookConflict(false)
    setCookConflict(null)
    startCookingNow(seed, initialMultiplier, initialCheckedSteps, initialCheckedIngredients)
  }

  function dismissCookConflict() {
    setCookConflict(null)
  }

  function stopCooking() {
    endSessionLocally(true)
    backgroundCookStatusRef.current?.exitFloatingView()
  }

  function clearJustFinished() {
    setJustFinishedRecipeId(null)
  }

  // Cross-device resume (Phase D): call this from a recipe page's mount
  // effect - if the signed-in user already has an active session for that
  // recipe elsewhere, silently resume into it.
  //
  // Tri-state return distinguishes "no session exists" from "this call was
  // discarded/inconclusive" - callers that fall back to starting a fresh
  // session (startCookingWithConflictCheck's same-recipe resume branch) must
  // only do so on 'none'. Treating 'discarded' the same as 'none' would risk
  // starting a fresh session that silently overwrites/destroys a session
  // that may genuinely still be live (the discovery fetch was raced away by
  // endSessionLocally bumping discoveryRequestIdRef, not because the server
  // said there's nothing to resume).
  async function discoverActiveSession(recipeId: string): Promise<'resumed' | 'none' | 'discarded'> {
    if (!currentUserId) return 'discarded'
    // Don't let visiting some other (possibly stale/abandoned) recipe's
    // page silently hijack an already-in-progress cook elsewhere - that's
    // exactly the cross-recipe collision the conflict dialog exists to
    // catch, and this path would bypass it.
    if (cookSessionActive && activeRecipeId && activeRecipeId !== recipeId) return 'discarded'
    const myRequestId = ++discoveryRequestIdRef.current
    const session = await getActiveCookSession(recipeId, getToken)
    if (discoveryRequestIdRef.current !== myRequestId) return 'discarded'
    if (!session) return 'none'
    if (!sameStringSet(session.checkedSteps, checkedStepsRef.current)) {
      setCheckedSteps(new Set(session.checkedSteps))
    }
    if (!sameStringSet(session.checkedIngredients, checkedIngredientsRef.current)) {
      setCheckedIngredients(new Set(session.checkedIngredients))
    }
    const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
      ? Math.max(0, session.currentStepNum - 1)
      : 0
    setWizardIndex(resumedIndex)
    lastEnteredStepRef.current = session.currentStepKey
      ? { stepKey: session.currentStepKey, stepNum: session.currentStepNum }
      : { stepKey: 'checklist', stepNum: 0 }
    setActiveRecipeId(recipeId)
    setCookSessionId(session.sessionId)
    setCookSessionStartedAt(session.startedAt)
    setCookSessionActive(true)
    return 'resumed'
  }

  function pipToggleNearestTimer() {
    resumeIfPaused()
    if (nearestTimer) onToggleTimer(nearestTimer.id)
  }

  // Mirrors CookDock's own Prev/Next handlers, which call handleStepEntered
  // for the DESTINATION step before changing wizardIndex - that's what keeps
  // lastEnteredStepRef/the server's currentStepNum in sync. Without this,
  // the PiP widget's prev/next controls would get silently reverted by the
  // next poll tick (which recomputes wizardIndex from the stale server step).
  function pipPreviousStep() {
    resumeIfPaused()
    const prevIndex = wizardIndex - 1
    if (prevIndex < 0) return
    const prev = flatSteps[prevIndex]
    if (prev) handleStepEntered(`${prev.groupIdx}-${prev.stepIdx}`, prev.stepNum)
    setWizardIndex(prevIndex)
  }

  function pipNextStep() {
    resumeIfPaused()
    if (!currentWizardStep) return
    markStepChecked(`${currentWizardStep.groupIdx}-${currentWizardStep.stepIdx}`)
    if (wizardIndex < flatSteps.length - 1) {
      const next = flatSteps[wizardIndex + 1]
      if (next) handleStepEntered(`${next.groupIdx}-${next.stepIdx}`, next.stepNum)
    }
    advanceWizardOrFinish()
  }

  // A resumed session whose recipe fetch never resolves (fails, or is just
  // slow) would otherwise leave `recipe`/`flatSteps` permanently empty while
  // cookSessionActive stays true - no dock, no Stop button, wake lock held
  // forever. Self-heal by tearing the session down locally once useRecipe
  // gives up on it; the server already has whatever state it had.
  useEffect(() => {
    if (activeRecipeNotFound && activeRecipeId) {
      endSessionLocally(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- endSessionLocally is a new function every render; it only needs to run when the notFound flag flips true for the current activeRecipeId
  }, [activeRecipeNotFound, activeRecipeId])

  // Reset the "misses" counter whenever a genuinely new session/recipe comes
  // into play, so a brand new session doesn't inherit a stale miss count
  // from whatever was polled right before it.
  useEffect(() => {
    consecutiveNullPollsRef.current = 0
  }, [cookSessionId, activeRecipeId])

  // While a session is active, poll for changes made from another device
  // (Phase D) - server-wins on every tick, no merge logic. Runs regardless
  // of which page is currently showing, since the dock is global now.
  useEffect(() => {
    if (!cookSessionActive || !cookSessionId || !activeRecipeId || !currentUserId) return
    let cancelled = false
    const interval = setInterval(() => {
      getActiveCookSession(activeRecipeId, getToken).then(session => {
        if (cancelled) return
        if (!session) {
          // A single null could be a transient network hiccup rather than a
          // reliable "session is over" signal - only tear down after a
          // couple of consecutive misses (~10s of the server confirming
          // there's no active session).
          consecutiveNullPollsRef.current += 1
          if (consecutiveNullPollsRef.current >= 2) {
            endSessionLocally(false)
          }
          return
        }
        consecutiveNullPollsRef.current = 0
        const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
          ? Math.max(0, session.currentStepNum - 1)
          : 0
        const stepChanged = resumedIndex !== wizardIndexRef.current
        const checkedStepsChanged = !sameStringSet(session.checkedSteps, checkedStepsRef.current)
        const checkedIngredientsChanged = !sameStringSet(session.checkedIngredients, checkedIngredientsRef.current)
        // Adopt lastEnteredStepRef/suppress the checked-state-sync effect
        // BEFORE the setCheckedSteps/setCheckedIngredients calls below that
        // will trigger it - otherwise that effect echoes this tab's stale
        // step pointer back to the server, overwriting the remote change
        // this poll just adopted (cross-tab step ping-pong). Only set the
        // flag when a checked-state setter below will actually fire - if
        // neither checked Set changes, the sync effect never runs, so a
        // flag set here would just stay stuck true and swallow the user's
        // next real checkbox tick.
        if (stepChanged) {
          lastEnteredStepRef.current = {
            stepKey: session.currentStepKey ?? 'checklist',
            stepNum: session.currentStepNum ?? 0,
          }
          if (checkedStepsChanged || checkedIngredientsChanged) {
            suppressNextCheckedSyncRef.current = true
          }
        }
        if (checkedStepsChanged) {
          setCheckedSteps(new Set(session.checkedSteps))
        }
        if (checkedIngredientsChanged) {
          setCheckedIngredients(new Set(session.checkedIngredients))
        }
        if (stepChanged) {
          setWizardIndex(resumedIndex)
        }
      })
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render; checkedSteps/checkedIngredients/wizardIndex are read via closure for comparison only (not to trigger the effect), so exclusion is intentional
  }, [cookSessionActive, cookSessionId, activeRecipeId, currentUserId])

  // Push checked-state changes to the backend session (Phase D) even when
  // they happen without a step transition.
  useEffect(() => {
    if (!cookSessionId) return
    if (suppressNextCheckedSyncRef.current) {
      suppressNextCheckedSyncRef.current = false
      return
    }
    const { stepKey, stepNum } = lastEnteredStepRef.current
    syncCookSession(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render; this effect should only re-fire on an actual checked-state change, not on every render
  }, [checkedSteps, checkedIngredients])

  useEffect(() => {
    if (cookSessionActive) void cookMode.request()
    else void cookMode.release()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cookMode is a new object every render; request/release are individually stable
  }, [cookSessionActive, cookMode.request, cookMode.release])

  // Auto-enter/exit the floating PiP view as the app is backgrounded and
  // foregrounded - the dock itself is always present while a session is
  // active, so there's nothing to "restore" here beyond exiting PiP.
  useEffect(() => {
    if (!cookSessionActive) return
    function handleVisibility() {
      if (document.hidden) backgroundCookStatusRef.current?.enterFloatingView()
      else backgroundCookStatusRef.current?.exitFloatingView()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [cookSessionActive])

  return {
    activeRecipeId, recipe, flatSteps, nearestTimer, currentWizardStep, wizardStepLabel,
    dockDisplayedTimer, dockDisplayedTimerId,
    cookSessionActive, cookSessionId, cookSessionStartedAt, startDockExpanded,
    cookConflict, resolvingCookConflict, startingCook, wizardIndex, multiplier,
    checkedSteps, checkedIngredients, lightboxUrl, justFinishedRecipeId,
    backgroundCookStatusRef,
    cookingPaused: pausedAt !== null, pausedAt, totalPausedMs, pauseCooking, resumeCooking: resumeIfPaused,
    openWizard, discoverActiveSession, confirmStartNewCook, dismissCookConflict,
    stopCooking, clearJustFinished, handleStepEntered, toggleStep, markStepChecked,
    toggleIngredient, advanceWizardOrFinish, handleWizardMarkDone, getTimerForStep,
    startTimer, pipToggleNearestTimer, pipPreviousStep, pipNextStep,
    setWizardIndex, setLightboxUrl, setMultiplier,
    onExpandConsumed: () => setStartDockExpanded(false),
  }
}
