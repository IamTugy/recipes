# Global Cook Session + Dock Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the cook-mode session (CookDock + BackgroundCookStatus + all cook-session state) from `RecipeDetail.tsx`-owned to `App.tsx`-owned/global, so the dock stays visible and PiP keeps working on every page while a cook is active — plus two small `CookDock` polish fixes.

**Architecture:** A new hook `src/hooks/useCookSession.ts`, called once in `App.tsx`, owns every piece of state/effect/function currently local to `RecipeDetail`'s cook-session block (mirrors the existing `useTimers()`/`TimerPanel` pattern exactly). `App.tsx` renders `<CookDock>`, `<BackgroundCookStatus>`, and a small global lightbox using this hook's state, and passes the whole hook return value down to `<RecipeDetail>` as one `cookSession` prop. `RecipeDetail` deletes its cook-session state/effects/functions, keeps its own general-purpose (non-cook) ingredient/step checklist as local `sessionStorage`-backed state, and mirrors the shared/global checked-state only when the recipe it's displaying is the one currently being cooked.

**Tech Stack:** React 18/Vite, TypeScript, no test framework on the frontend (established precedent — `npm run build` + eslint clean is the bar).

## Global Constraints

- No em dash in any UI copy or comments (repo-wide writing-style rule).
- `npm run build` and `npm run lint` (or equivalent configured script) must pass with zero errors before any task is considered done.
- No backend/API changes — this is a frontend state-ownership relocation only (per the design doc's Out of Scope section).
- No change to Phase F's cook-conflict warning logic, Phase D's cross-device resume/sync mechanism, or what data the dock/checklist track — only where that logic lives.
- Follow this codebase's existing `.btn-ghost` outline-button convention (`border: 1px solid rgb(var(--color-tint) / 0.12)`, transparent background, hover shifts to amber) for the "Stop cooking" restyle, sized down for the dock's compact header.

---

## File Structure

- **Create `src/hooks/useCookSession.ts`** — the new global hook. Owns all cook-session state, the Phase D discovery/poll/sync effects, the wake lock, the PiP visibility effect, and every cook-session function (`openWizard`, `stopCooking`, `handleStepEntered`, `toggleStep`, `markStepChecked`, `toggleIngredient`, `advanceWizardOrFinish`, `handleWizardMarkDone`, `getTimerForStep`, `startTimer`, the three `pip*` functions, `confirmStartNewCook`, `dismissCookConflict`, `discoverActiveSession`, `clearJustFinished`). Returns one object; callers destructure what they need or pass the whole object down.
- **Modify `src/App.tsx`** — call `useCookSession()` once, render `<CookDock>`/`<BackgroundCookStatus>`/a small global lightbox globally (same tree position as `TimerPanel`), pass the hook's return value to `<RecipeDetail>` as a `cookSession` prop.
- **Modify `src/components/RecipeDetail.tsx`** — delete all cook-session state/effects/functions (now owned by the hook), read cook-session data through the new `cookSession` prop, keep the general (non-cook) ingredient/step checklist as local state that mirrors the shared state only while viewing the actively-cooked recipe, wire the "Start cooking" button and the cook-conflict `ConfirmDialog` to the prop, and add a small effect that opens `PostCookReviewModal` when the hook signals a finish for the recipe currently being viewed.
- **Modify `src/components/CookDock.tsx`** — the two polish fixes: move the collapsed-state chevron into its own centered strip (mirroring the expanded state's existing strip), and restyle "Stop cooking" as a compact outline button.

**Prop-bundling note (deviation from the individual-props style `timers`/`onAddTimer` use):** `useCookSession()` returns 25+ values. Passing each individually to `<RecipeDetail>` would make `RecipeDetailProps` unreadable. `RecipeDetailProps` instead gets one `cookSession: ReturnType<typeof useCookSession>` prop. This is deliberate — not an oversight to flag in review.

**Recipe data simplification (deliberate, in scope):** the hook fetches the currently-cooking recipe via `useRecipe(activeRecipeId)` and reads `recipe.title`/`recipe.titleHe` directly (same pattern `flatSteps` already uses for `instruction`/`instructionEn`) rather than routing through `useTranslatedText`'s on-demand-translation API calls. `BackgroundCookStatus`'s `recipeTitle` and the dock's ingredients/steps therefore show the recipe's raw title/fields, not a live machine translation, when shown outside the recipe's own page. This matches the design doc's existing multiplier-defaults-to-1x simplification for the same "shown elsewhere" case.

---

### Task 1: `useCookSession` hook + `App.tsx` wiring

**Files:**
- Create: `src/hooks/useCookSession.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `useCookSession(lang: 'he' | 'en', timers: TimerState[], onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void, onToggleTimer: (id: string) => void)` returning the object shown in Step 2 below. `App.tsx` calls this once and threads the result to `<RecipeDetail cookSession={cookSession} .../>`.
- Consumes (Task 2): `RecipeDetail` will read `cookSession.cookSessionActive`, `cookSession.startingCook`, `cookSession.openWizard`, `cookSession.cookConflict`, `cookSession.resolvingCookConflict`, `cookSession.confirmStartNewCook`, `cookSession.dismissCookConflict`, `cookSession.activeRecipeId`, `cookSession.checkedSteps`, `cookSession.checkedIngredients`, `cookSession.toggleStep`, `cookSession.markStepChecked`, `cookSession.toggleIngredient`, `cookSession.multiplier`, `cookSession.setMultiplier`, `cookSession.justFinishedRecipeId`, `cookSession.clearJustFinished`, `cookSession.discoverActiveSession`.

- [ ] **Step 1: Create `src/hooks/useCookSession.ts` with the full hook implementation**

```typescript
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
```

- [ ] **Step 2: Wire the hook into `App.tsx`**

Add imports (alongside the existing ones):

```typescript
import BackgroundCookStatus from './components/BackgroundCookStatus'
import CookDock from './components/CookDock'
import { useCookSession } from './hooks/useCookSession'
```

Inside `App()`, right after the existing `const { timers, addTimer, toggleTimer, removeTimer, resetTimer } = useTimers()` line, add:

```typescript
  const cookSession = useCookSession(lang, timers, addTimer, toggleTimer)
```

(`lang` is already destructured a few lines below from `useLanguage()` at the current line 46 — move that `const { lang, setLang } = useLanguage()` line above this new `useCookSession()` call, since the hook needs `lang` as its first argument.)

Update the `<RecipeDetail>` render call (currently lines 190-196) to add the new prop:

```tsx
              <RecipeDetail
                onAddTimer={addTimer}
                onToggleTimer={toggleTimer}
                timers={timers}
                timerBarHeight={timerBarHeight}
                onAddToShoppingList={shoppingList.addItems}
                cookSession={cookSession}
              />
```

Add the global cook-session render block right after the existing `<AnimatePresence>{timers.length > 0 && (<TimerPanel .../>)}</AnimatePresence>` block and before `<ShoppingListPanel>`:

```tsx
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <div aria-hidden="true" className="h-[20dvh] sm:h-24" style={{ paddingBottom: timerBarHeight }} />
      )}
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <CookDock
          lang={lang}
          ingredients={cookSession.recipe?.ingredients ?? []}
          checkedIngredients={cookSession.checkedIngredients}
          onToggleIngredient={cookSession.toggleIngredient}
          multiplier={cookSession.multiplier}
          steps={cookSession.flatSteps}
          wizardIndex={cookSession.wizardIndex}
          onPrev={() => cookSession.setWizardIndex(i => Math.max(i - 1, 0))}
          onAdvance={key => { cookSession.markStepChecked(key); cookSession.advanceWizardOrFinish() }}
          onMarkDone={cookSession.handleWizardMarkDone}
          onStop={cookSession.stopCooking}
          onStepEntered={cookSession.handleStepEntered}
          onExpand={() => cookSession.backgroundCookStatusRef.current?.exitFloatingView()}
          checkedSteps={cookSession.checkedSteps}
          nearestTimer={cookSession.nearestTimer}
          onToggleNearestTimer={cookSession.pipToggleNearestTimer}
          getTimerForStep={cookSession.getTimerForStep}
          onStartTimer={cookSession.startTimer}
          onOpenLightbox={cookSession.setLightboxUrl}
          timerBarHeight={timerBarHeight}
          lightboxOpen={!!cookSession.lightboxUrl}
          elapsedBaselineMs={cookSession.cookSessionStartedAt ? new Date(cookSession.cookSessionStartedAt).getTime() : undefined}
          startExpanded={cookSession.startDockExpanded}
          onExpandConsumed={cookSession.onExpandConsumed}
        />
      )}
      <BackgroundCookStatus
        ref={cookSession.backgroundCookStatusRef}
        active={cookSession.cookSessionActive && !!cookSession.currentWizardStep}
        recipeTitle={lang === 'he' ? (cookSession.recipe?.titleHe ?? cookSession.recipe?.title ?? '') : (cookSession.recipe?.title ?? '')}
        stepLabel={cookSession.wizardStepLabel}
        stepText={cookSession.currentWizardStep?.instruction ?? ''}
        nearestTimer={cookSession.nearestTimer}
        lang={lang}
        canGoPrev={cookSession.wizardIndex > 0}
        canGoNext={cookSession.wizardIndex < cookSession.flatSteps.length - 1}
        onToggleNearestTimer={cookSession.pipToggleNearestTimer}
        onPrevStep={cookSession.pipPreviousStep}
        onNextStep={cookSession.pipNextStep}
      />
      {cookSession.lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="print:hidden fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => cookSession.setLightboxUrl(null)}
        >
          <button type="button"
            onClick={() => cookSession.setLightboxUrl(null)}
            aria-label={tx.close}
            className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            ✕
          </button>
          <img
            src={cookSession.lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
```

Add an Escape-key handler for this new global lightbox, alongside `App`'s other top-level `useEffect`s (near the existing keyboard-shortcuts effect):

```typescript
  useEffect(() => {
    if (!cookSession.lightboxUrl) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') cookSession.setLightboxUrl(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [cookSession.lightboxUrl, cookSession.setLightboxUrl])
```

- [ ] **Step 3: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with no TypeScript errors. `RecipeDetail.tsx` will fail to compile at this point because it doesn't yet accept a `cookSession` prop and still declares its own conflicting local cook-session state (`cookSessionActive`, `wizardIndex`, etc. now also exist on the `cookSession` object) - Task 2 fixes this. **Confirm the only errors are inside `RecipeDetail.tsx`** (missing `cookSession` prop, or references to old local names) - any error inside `App.tsx` or `useCookSession.ts` must be fixed now, in this task.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCookSession.ts src/App.tsx
git commit -m "feat: add global useCookSession hook, wire into App.tsx"
```

---

### Task 2: `RecipeDetail.tsx` rewire + `CookDock` polish

**Files:**
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/components/CookDock.tsx`

**Interfaces:**
- Consumes: the `cookSession` prop shape produced by Task 1's `useCookSession()` (see the return object in Task 1 Step 1).

- [ ] **Step 1: Add the `cookSession` prop to `RecipeDetailProps`**

In `src/components/RecipeDetail.tsx`, replace the current interface (lines 42-48):

```typescript
interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  onToggleTimer: (id: string) => void
  timers: TimerState[]
  timerBarHeight: number
  onAddToShoppingList: (items: { name: string; amount: number | null; unit: string }[]) => void
}
```

with:

```typescript
interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  onToggleTimer: (id: string) => void
  timers: TimerState[]
  timerBarHeight: number
  onAddToShoppingList: (items: { name: string; amount: number | null; unit: string }[]) => void
  cookSession: ReturnType<typeof useCookSession>
}
```

Add the import: `import { useCookSession } from '../hooks/useCookSession'`

Update the function signature (line 58) to destructure it:

```typescript
export default function RecipeDetail({ onAddTimer, onToggleTimer, timers, timerBarHeight, onAddToShoppingList, cookSession }: RecipeDetailProps) {
```

- [ ] **Step 2: Remove now-unused imports**

Delete these import lines (all moved into `useCookSession.ts`):
- `import { useWakeLock } from '../hooks/useWakeLock'`
- `import BackgroundCookStatus, { type BackgroundCookStatusHandle } from './BackgroundCookStatus'`
- `import CookDock from './CookDock'`
- The multi-line `import { startCookSession, logCookSessionStep, finishCookSession, abandonCookSession, getActiveCookSession, syncCookSession, getCurrentCookSession } from '../lib/cookSessions'`

Keep `import ConfirmDialog from './ConfirmDialog'` and `import PostCookReviewModal from './PostCookReviewModal'` - both stay, unchanged.

- [ ] **Step 3: Delete the module-level `sameStringSet` helper (lines 53-56)**

It's only used by the effects being deleted in this task; the hook has its own private copy.

- [ ] **Step 4: Delete cook-session state/refs no longer owned by `RecipeDetail`**

Delete these declarations entirely (all now live in `cookSession`):

```typescript
  const [cookSessionActive, setCookSessionActive] = useState(false)
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
  const [startDockExpanded, setStartDockExpanded] = useState(false)
  const [cookConflict, setCookConflict] = useState<{ sessionId: string; recipeTitle: string } | null>(null)
  const [resolvingCookConflict, setResolvingCookConflict] = useState(false)
  const [startingCook, setStartingCook] = useState(false)
  const pendingCookStepRef = useRef<{ stepKey: string; stepNum: number } | null>(null)
  const lastEnteredStepRef = useRef<{ stepKey: string; stepNum: number }>({ stepKey: 'checklist', stepNum: 0 })
  const suppressNextCheckedSyncRef = useRef(false)
  const [wizardIndex, setWizardIndex] = useState(0)
```

Also delete `const wizardIndexRef = useRef(wizardIndex)` and its sync effect `useEffect(() => { wizardIndexRef.current = wizardIndex }, [wizardIndex])`, and delete `const cookMode = useWakeLock()` plus `const backgroundCookStatusRef = useRef<BackgroundCookStatusHandle>(null)`.

- [ ] **Step 5: Fork `checkedSteps`/`checkedIngredients` between the hook and local `sessionStorage`-backed state**

Replace the existing declarations:

```typescript
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const checkedStepsRef = useRef(checkedSteps)
  const checkedIngredientsRef = useRef(checkedIngredients)
```

with:

```typescript
  // True while this page is showing the exact recipe currently being
  // cooked - in that case the checklist mirrors the global cook-session
  // state live (so ticking a box here shows up in the dock too, and vice
  // versa). Any other recipe keeps its own independent local state,
  // unaffected by whatever's being cooked elsewhere.
  const isActiveCookingRecipe = !!id && id === cookSession.activeRecipeId
  const [localCheckedSteps, setLocalCheckedSteps] = useState<Set<string>>(new Set())
  const [localCheckedIngredients, setLocalCheckedIngredients] = useState<Set<string>>(new Set())
  const checkedSteps = isActiveCookingRecipe ? cookSession.checkedSteps : localCheckedSteps
  const checkedIngredients = isActiveCookingRecipe ? cookSession.checkedIngredients : localCheckedIngredients
```

- [ ] **Step 6: Fork `toggleStep`/`markStepChecked`/`toggleIngredient` the same way**

Replace the three function definitions:

```typescript
  function toggleStep(key: string) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  function markStepChecked(key: string) {
    setCheckedSteps(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev).add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }
```

and

```typescript
  function toggleIngredient(key: string) {
    setCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { sessionStorage.setItem(`checked-ingredients-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }
```

with (local variants renamed, plus the forking wrappers used everywhere else in the file):

```typescript
  function localToggleStep(key: string) {
    setLocalCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  function localMarkStepChecked(key: string) {
    setLocalCheckedSteps(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev).add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  function localToggleIngredient(key: string) {
    setLocalCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { sessionStorage.setItem(`checked-ingredients-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  const toggleStep = isActiveCookingRecipe ? cookSession.toggleStep : localToggleStep
  const markStepChecked = isActiveCookingRecipe ? cookSession.markStepChecked : localMarkStepChecked
  const toggleIngredient = isActiveCookingRecipe ? cookSession.toggleIngredient : localToggleIngredient
```

Place this block immediately after the Step 5 declarations, since it references `isActiveCookingRecipe`.

- [ ] **Step 7: Fork `multiplier` the same way**

Replace `const [multiplier, setMultiplier] = useState(1)` (line 146) with:

```typescript
  const [localMultiplier, setLocalMultiplier] = useState(1)
  const multiplier = isActiveCookingRecipe ? cookSession.multiplier : localMultiplier
  function setMultiplierValue(m: number) {
    if (isActiveCookingRecipe) cookSession.setMultiplier(m)
    else setLocalMultiplier(m)
  }
```

Update `handleCustomInput` and `handlePresetClick` (originally lines 799-814) to call `setMultiplierValue` instead of `setMultiplier`:

```typescript
  function handleCustomInput(val: string) {
    setCustomInput(val)
    if (val === '') {
      setMultiplierValue(1)
      return
    }
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0 && n <= 100 && recipe!.servings > 0) {
      setMultiplierValue(n / recipe!.servings)
    }
  }

  function handlePresetClick(m: number) {
    setMultiplierValue(m)
    setCustomInput('')
  }
```

- [ ] **Step 8: Trim Effect D (reset-on-recipe-change) to drop the cook-session resets**

Replace:

```typescript
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`checked-${id}`)
      setCheckedSteps(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedSteps(new Set()) }
    try {
      const saved = sessionStorage.getItem(`checked-ingredients-${id}`)
      setCheckedIngredients(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedIngredients(new Set()) }
    window.scrollTo({ top: 0, behavior: 'instant' })
    setViewingRevision(null)
    setRevisionsOpen(false)
    setRevisions(null)
    setCookSessionActive(false)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
  }, [id])
```

with:

```typescript
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`checked-${id}`)
      setLocalCheckedSteps(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setLocalCheckedSteps(new Set()) }
    try {
      const saved = sessionStorage.getItem(`checked-ingredients-${id}`)
      setLocalCheckedIngredients(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setLocalCheckedIngredients(new Set()) }
    window.scrollTo({ top: 0, behavior: 'instant' })
    setViewingRevision(null)
    setRevisionsOpen(false)
    setRevisions(null)
  }, [id])
```

- [ ] **Step 9: Replace the discovery effect (Effect E) with a trimmed call into the hook**

Replace:

```typescript
  useEffect(() => {
    if (!id || !currentUserId) return
    let cancelled = false
    getActiveCookSession(id, getToken).then(session => {
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
      lastEnteredStepRef.current = session.currentStepKey
        ? { stepKey: session.currentStepKey, stepNum: session.currentStepNum }
        : { stepKey: 'checklist', stepNum: 0 }
      setCookSessionId(session.sessionId)
      setCookSessionStartedAt(session.startedAt)
      setCookSessionActive(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render from useAuth(); checkedSteps/checkedIngredients/wizardIndex are read via closure for comparison only (not to trigger the effect), so exclusion is intentional
  }, [id, currentUserId])
```

with:

```typescript
  // Cross-device resume (Phase D): on loading a recipe, check whether the
  // signed-in user already has an active cook session for it elsewhere -
  // if so, silently resume into it via the global hook (no prompt, per
  // design). discoverActiveSession guards its own races internally.
  useEffect(() => {
    if (!id || !currentUserId) return
    cookSession.discoverActiveSession(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cookSession.discoverActiveSession is a new function every render from useCookSession(); it's stable enough for this one-shot-per-id-change call
  }, [id, currentUserId])
```

- [ ] **Step 10: Delete Effect F (polling), Effect G (checked-state sync push), Effect H (wake lock), Effect I (PiP visibility)**

Delete all four effects entirely (verbatim bodies were quoted in the earlier research pass; they now live inside `useCookSession.ts` from Task 1). These are the effects with dependency arrays `[cookSessionActive, id, currentUserId]`, `[checkedSteps, checkedIngredients]` (the one calling `syncCookSession`), `[cookSessionActive, cookMode.request, cookMode.release]`, and `[cookSessionActive]` (the one calling `backgroundCookStatusRef.current?.enterFloatingView()`).

- [ ] **Step 11: Delete cook-session-only functions**

Delete these function definitions entirely (all now live in `useCookSession.ts`): `advanceWizardOrFinish`, `handleWizardMarkDone`, `openWizard`, `startCookingWithConflictCheck`, `startCookingNow`, `confirmStartNewCook`, `pipToggleNearestTimer`, `pipPreviousStep`, `pipNextStep`, `stopCooking`, `handleStepEntered`.

Keep `getTimerForStep` and `startTimer` exactly as they are - both are also used by `RecipeDetail`'s own general (non-cook) steps list, independent of cook mode.

- [ ] **Step 12: Delete cook-session-only derivations**

Delete `const currentWizardStep = cookSessionActive ? flatSteps[wizardIndex] : undefined` and the `wizardStepLabel` const below it, and delete the `nearestTimer` derivation (the `recipeTimers`/`runningRecipeTimers`/`nearestTimer` three-line block). Keep `flatSteps`/`stepNums` exactly as they are - both are also used by the general (non-cook) steps list and section nav, independent of cook mode.

- [ ] **Step 13: Update the "Start cooking" button**

Replace:

```tsx
              <button type="button"
                disabled={cookSessionActive || startingCook}
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  openWizard()
                }}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">🍳</span>
                {cookSessionActive ? tx.cooking : tx.startCooking}
              </button>
```

with:

```tsx
              <button type="button"
                disabled={cookSession.cookSessionActive || cookSession.startingCook}
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  if (recipe) cookSession.openWizard(recipe, multiplier)
                }}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">🍳</span>
                {cookSession.cookSessionActive ? tx.cooking : tx.startCooking}
              </button>
```

- [ ] **Step 14: Delete the `<CookDock>` render block, its spacer `<div>`, and the `<BackgroundCookStatus>` render block**

Delete this entire block (both now render globally from `App.tsx`):

```tsx
      {cookSessionActive && flatSteps.length > 0 && (
        <div aria-hidden="true" className="h-[20dvh] sm:h-24" style={{ paddingBottom: timerBarHeight }} />
      )}

      {cookSessionActive && flatSteps.length > 0 && (
        <CookDock
          ... (full prop list)
        />
      )}
```

and this block:

```tsx
      <BackgroundCookStatus
        ref={backgroundCookStatusRef}
        ... (full prop list)
      />
```

Do **not** delete `RecipeDetail`'s own lightbox JSX (the `{lightboxUrl && (<div ref={lightboxRef} ...>...)}` block), `lightboxRef`, `useFocusTrap(lightboxRef, !!lightboxUrl)`, or the lightbox's Escape-key effect - all of that stays exactly as-is, since it's still used by `RecipeDetail`'s own general step-image click handler (`onClick={e => { e.stopPropagation(); setLightboxUrl(step.image!) }}`), independent of cook mode.

- [ ] **Step 15: Update the cook-conflict `ConfirmDialog`**

Replace:

```tsx
      <ConfirmDialog
        open={!!cookConflict}
        title={tx.alreadyCookingElsewhere}
        message={cookConflict ? tx.cookingElsewhereWarning(cookConflict.recipeTitle) : ''}
        confirmLabel={tx.startNewCook}
        cancelLabel={tx.cancel}
        busy={resolvingCookConflict}
        onConfirm={confirmStartNewCook}
        onCancel={() => setCookConflict(null)}
      />
```

with:

```tsx
      <ConfirmDialog
        open={!!cookSession.cookConflict}
        title={tx.alreadyCookingElsewhere}
        message={cookSession.cookConflict ? tx.cookingElsewhereWarning(cookSession.cookConflict.recipeTitle) : ''}
        confirmLabel={tx.startNewCook}
        cancelLabel={tx.cancel}
        busy={cookSession.resolvingCookConflict}
        onConfirm={() => recipe && cookSession.confirmStartNewCook(recipe, multiplier)}
        onCancel={cookSession.dismissCookConflict}
      />
```

- [ ] **Step 16: Add the post-cook review nudge effect**

Add a new `useEffect` near the existing `showPostCookReviewModal`/`hasPostedReview` state declarations (around where `advanceWizardOrFinish` used to live before Step 11 deleted it):

```typescript
  // The global cook session signals a natural finish (last step reached)
  // for whichever recipe just finished cooking - if that's the recipe
  // this page is showing and the user hasn't reviewed it yet, offer the
  // post-cook review nudge (Phase G). If the user finished cooking while
  // on a different page, this simply waits until they navigate back here;
  // CookReminderBanner (Phase G) catches the case where they never do.
  useEffect(() => {
    if (cookSession.justFinishedRecipeId === id && currentUserId && !hasPostedReview) {
      setShowPostCookReviewModal(true)
      cookSession.clearJustFinished()
    }
  }, [cookSession.justFinishedRecipeId, id, currentUserId, hasPostedReview, cookSession])
```

- [ ] **Step 17: Update the `<CookDock>` prop's multiplier reference and any remaining stray references**

Search the file for any remaining bare references to the deleted local names (`cookSessionActive`, `cookSessionId`, `cookSessionStartedAt`, `startDockExpanded`, `cookConflict`, `resolvingCookConflict`, `startingCook`, `wizardIndex`, `flatSteps` used in a cook-only context, `nearestTimer`, `currentWizardStep`, `wizardStepLabel`, `backgroundCookStatusRef`, `cookMode`, `openWizard`, `stopCooking`, `handleStepEntered`, `pipToggleNearestTimer`, `pipPreviousStep`, `pipNextStep`, `advanceWizardOrFinish`, `handleWizardMarkDone`, `confirmStartNewCook`) and route each through `cookSession.*` or delete if it was only used by now-deleted JSX. This step exists because TypeScript will surface every one of these as a compile error - work through them one at a time rather than guessing; each fix is a one-line `X` to `cookSession.X` rename.

- [ ] **Step 18: `CookDock.tsx` polish fix 1 - reposition the collapsed-state chevron**

Replace the collapsed-state branch (currently lines 428-450):

```tsx
      ) : (
        <div className="flex-1 flex items-center justify-between px-4 gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-cream/30 tabular-nums mb-0.5">
              {formatDockDuration(elapsedSeconds)}
            </p>
            <p className="text-sm text-cream/80 truncate">{collapsedStepLabel}</p>
          </div>
          <svg className="w-4 h-4 shrink-0 text-cream/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
          {displayedTimer && (
            <button type="button"
              onClick={e => { e.stopPropagation(); onToggleNearestTimer() }}
              aria-label={displayedTimer.running ? tx.pauseTimer : tx.resumeTimer}
            >
              <TimerRing fraction={displayedTimer.totalSeconds > 0 ? displayedTimer.remainingSeconds / displayedTimer.totalSeconds : 0}>
                {formatDockDuration(displayedTimer.remainingSeconds)}
              </TimerRing>
            </button>
          )}
        </div>
      )}
```

with:

```tsx
      ) : (
        <>
          <div className="flex items-center justify-center h-6 shrink-0">
            <svg className="w-4 h-4 text-cream/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </div>
          <div className="flex-1 flex items-center justify-between px-4 gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-cream/30 tabular-nums mb-0.5">
                {formatDockDuration(elapsedSeconds)}
              </p>
              <p className="text-sm text-cream/80 truncate">{collapsedStepLabel}</p>
            </div>
            {displayedTimer && (
              <button type="button"
                onClick={e => { e.stopPropagation(); onToggleNearestTimer() }}
                aria-label={displayedTimer.running ? tx.pauseTimer : tx.resumeTimer}
              >
                <TimerRing fraction={displayedTimer.totalSeconds > 0 ? displayedTimer.remainingSeconds / displayedTimer.totalSeconds : 0}>
                  {formatDockDuration(displayedTimer.remainingSeconds)}
                </TimerRing>
              </button>
            )}
          </div>
        </>
      )}
```

The chevron no longer needs its own click handler - the whole collapsed bar's outer wrapping `<div>` already has `onClick={() => { if (!expanded) setExpandedState(true) }}` (line 213), so tapping the new strip still expands the dock exactly as before.

- [ ] **Step 19: `CookDock.tsx` polish fix 2 - restyle "Stop cooking" as an outline button**

Replace (currently lines 235-240):

```tsx
            <button type="button"
              onClick={e => { e.stopPropagation(); onStop() }}
              className="px-3 h-9 flex items-center justify-center rounded-lg text-sm font-medium text-cream/60 hover:text-cream/90 transition-colors"
            >
              {tx.stopCooking}
            </button>
```

with:

```tsx
            <button type="button"
              onClick={e => { e.stopPropagation(); onStop() }}
              className="px-3 h-8 flex items-center justify-center rounded-full text-xs font-medium border border-tint/[0.12] text-cream/55 bg-transparent hover:border-amber/40 hover:text-amber transition-colors"
            >
              {tx.stopCooking}
            </button>
```

This mirrors this codebase's `.btn-ghost` convention (`border: 1px solid rgb(var(--color-tint) / 0.12)`, transparent background, hover shifts to amber border/text - see `src/index.css` lines 145-151), sized down (`h-8`, `text-xs`, `px-3`, `rounded-full`) to fit the dock's compact header row instead of `.btn-ghost`'s own padding.

- [ ] **Step 20: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with zero TypeScript errors.

Run: `npm run lint` (or whichever lint script `package.json` defines)
Expected: zero errors, including no unused-variable warnings for anything deleted in this task (e.g. `sameStringSet`, `checkedStepsRef`, `checkedIngredientsRef`, `wizardIndexRef` if any survived Steps 4-12 unused).

- [ ] **Step 21: Manual verification**

Run `npm run dev`, sign in, and check:
1. Start cooking a recipe, navigate to a different page (e.g. Home or another recipe) - the dock is still visible and functional there.
2. While cooking, background the tab (switch to another browser tab) - PiP/OS-notification still triggers correctly regardless of which page was showing when backgrounded.
3. On the recipe's own page while cooking, tick a box in the page's inline ingredient checklist - it shows up checked in the dock too, and vice versa.
4. Open a *different* recipe's page while a session is active elsewhere - its own inline checklist is independent (unchecked/its own local state), unaffected by the active cook.
5. Collapse the dock - the chevron sits in its own centered strip at the top, matching the expanded state's strip.
6. Expand the dock - "Stop cooking" renders as an outline button (border, transparent background, amber on hover).
7. Finish a cook session naturally (reach the last step and mark done) while on the recipe's own page - the post-cook review modal opens (Phase G, unaffected).

- [ ] **Step 22: Commit**

```bash
git add src/components/RecipeDetail.tsx src/components/CookDock.tsx
git commit -m "refactor: rewire RecipeDetail onto global cook session, polish CookDock"
```
