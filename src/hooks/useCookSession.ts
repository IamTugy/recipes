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
  const { recipe: fetchedRecipe } = useRecipe(activeRecipeId)
  const recipe = fetchedRecipe ?? seedRecipe ?? undefined

  const [cookSessionActive, setCookSessionActive] = useState(false)
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
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

  function toggleStep(key: string) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function markStepChecked(key: string) {
    setCheckedSteps(prev => {
      if (prev.has(key)) return prev
      return new Set(prev).add(key)
    })
  }

  function toggleIngredient(key: string) {
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
    if (!recipe) return
    onAddTimer(label, minutes, recipe.id, groupIdx * 10000 + stepIdx)
  }

  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      const finishedRecipeId = activeRecipeId
      if (cookSessionId) {
        finishCookSession(cookSessionId, getToken)
        setCookSessionId(null)
      }
      setCookSessionActive(false)
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
    lastEnteredStepRef.current = { stepKey, stepNum }
    if (!cookSessionId) {
      pendingCookStepRef.current = { stepKey, stepNum }
      return
    }
    suppressNextCheckedSyncRef.current = true
    logCookSessionStep(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
  }

  // seed is whatever recipe RecipeDetail already had loaded - see the
  // seedRecipe comment above for why this can't wait for useRecipe's fetch.
  function startCookingNow(seed: Recipe, initialMultiplier: number) {
    let n = 0
    const localStepNums: number[][] = seed.steps.map(g => g.items.map(() => ++n))
    const localFlatSteps = seed.steps.flatMap((group, gi) =>
      group.items.map((_step, si) => ({ groupIdx: gi, stepIdx: si, stepNum: localStepNums[gi][si] }))
    )
    const firstUnchecked = localFlatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
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
          group.items.every((_, ii) => checkedIngredients.has(`${gi}-${ii}`))
        )
        const initialStep = localFlatSteps[startIndex]
        if (allIngredientsChecked && initialStep) {
          const stepKey = `${initialStep.groupIdx}-${initialStep.stepIdx}`
          lastEnteredStepRef.current = { stepKey, stepNum: initialStep.stepNum }
          logCookSessionStep(sessionId, stepKey, initialStep.stepNum, [...checkedSteps], [...checkedIngredients], getToken)
        } else if (pendingCookStepRef.current) {
          const { stepKey, stepNum } = pendingCookStepRef.current
          pendingCookStepRef.current = null
          logCookSessionStep(sessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
        }
      })
    }
  }

  async function startCookingWithConflictCheck(seed: Recipe, initialMultiplier: number) {
    try {
      if (currentUserId) {
        const current = await getCurrentCookSession(getToken)
        if (current && current.recipeId !== seed.id) {
          setCookConflict({ sessionId: current.sessionId, recipeTitle: current.recipeTitle })
          return
        }
      }
      startCookingNow(seed, initialMultiplier)
    } finally {
      setStartingCook(false)
    }
  }

  function openWizard(seed: Recipe, initialMultiplier: number) {
    if (cookSessionActive || startingCook) return
    setStartingCook(true)
    void startCookingWithConflictCheck(seed, initialMultiplier)
  }

  async function confirmStartNewCook(seed: Recipe, initialMultiplier: number) {
    if (!cookConflict) return
    setResolvingCookConflict(true)
    await abandonCookSession(cookConflict.sessionId, getToken)
    setResolvingCookConflict(false)
    setCookConflict(null)
    startCookingNow(seed, initialMultiplier)
  }

  function dismissCookConflict() {
    setCookConflict(null)
  }

  function stopCooking() {
    if (cookSessionId) {
      abandonCookSession(cookSessionId, getToken)
      setCookSessionId(null)
    }
    setCookSessionStartedAt(null)
    setCookSessionActive(false)
    backgroundCookStatusRef.current?.exitFloatingView()
  }

  function clearJustFinished() {
    setJustFinishedRecipeId(null)
  }

  // Cross-device resume (Phase D): call this from a recipe page's mount
  // effect - if the signed-in user already has an active session for that
  // recipe elsewhere, silently resume into it.
  async function discoverActiveSession(recipeId: string) {
    if (!currentUserId) return
    const myRequestId = ++discoveryRequestIdRef.current
    const session = await getActiveCookSession(recipeId, getToken)
    if (discoveryRequestIdRef.current !== myRequestId || !session) return
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
  }

  function pipToggleNearestTimer() {
    if (nearestTimer) onToggleTimer(nearestTimer.id)
  }

  function pipPreviousStep() {
    setWizardIndex(i => Math.max(i - 1, 0))
  }

  function pipNextStep() {
    if (!currentWizardStep) return
    markStepChecked(`${currentWizardStep.groupIdx}-${currentWizardStep.stepIdx}`)
    advanceWizardOrFinish()
  }

  // While a session is active, poll for changes made from another device
  // (Phase D) - server-wins on every tick, no merge logic. Runs regardless
  // of which page is currently showing, since the dock is global now.
  useEffect(() => {
    if (!cookSessionActive || !cookSessionId || !activeRecipeId || !currentUserId) return
    let cancelled = false
    const interval = setInterval(() => {
      getActiveCookSession(activeRecipeId, getToken).then(session => {
        if (cancelled || !session) return
        if (!sameStringSet(session.checkedSteps, checkedStepsRef.current)) {
          setCheckedSteps(new Set(session.checkedSteps))
        }
        if (!sameStringSet(session.checkedIngredients, checkedIngredientsRef.current)) {
          setCheckedIngredients(new Set(session.checkedIngredients))
        }
        const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
          ? Math.max(0, session.currentStepNum - 1)
          : 0
        if (resumedIndex !== wizardIndexRef.current) {
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
    cookSessionActive, cookSessionId, cookSessionStartedAt, startDockExpanded,
    cookConflict, resolvingCookConflict, startingCook, wizardIndex, multiplier,
    checkedSteps, checkedIngredients, lightboxUrl, justFinishedRecipeId,
    backgroundCookStatusRef,
    openWizard, discoverActiveSession, confirmStartNewCook, dismissCookConflict,
    stopCooking, clearJustFinished, handleStepEntered, toggleStep, markStepChecked,
    toggleIngredient, advanceWizardOrFinish, handleWizardMarkDone, getTimerForStep,
    startTimer, pipToggleNearestTimer, pipPreviousStep, pipNextStep,
    setWizardIndex, setLightboxUrl, setMultiplier,
    onExpandConsumed: () => setStartDockExpanded(false),
  }
}
