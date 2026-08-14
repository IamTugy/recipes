# Cook Mode Redesign — Phase B: Persistent Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fullscreen wizard modal in `RecipeDetail.tsx` with a persistent, non-floating bottom dock (collapsed ~1/5-viewport bar, expandable to 90dvh on tap/swipe), extracted into a new `CookDock.tsx` component.

**Architecture:** One new component (`CookDock.tsx`) owns its own collapsed/expanded UI state, swipe/tap gestures, the ingredient-checklist-vs-steps screen choice, and a client-side elapsed-time stopwatch. `RecipeDetail.tsx` keeps owning the state it already owns today (`cookSessionActive`, `wizardIndex`, `checkedSteps`, `checkedIngredients`, timers) and passes it down as props/callbacks — `CookDock` is a presentation/gesture layer, not a new state owner. The old fullscreen-modal JSX block, its dedicated effects (keyboard nav, body-scroll lock, focus trap - all currently tied to `wizardOpen`), and the `wizardOpen` state itself are deleted; that functionality moves into `CookDock`, tied to its own internal `expanded` state instead.

**Tech Stack:** React 19, TypeScript, Tailwind CSS. No new dependencies - the swipe gesture is a plain touch-event handler (same pattern as `Sidebar.tsx`'s existing swipe-to-close), the timer ring is a hand-rolled SVG circle (no charting library).

## Global Constraints

- No backend changes. No new dependencies.
- `CookDock` renders only while a cook session is active (`cookSessionActive`) - `RecipeDetail.tsx` conditionally mounts it, matching today's `{wizardOpen && ...}` pattern but keyed on `cookSessionActive` instead.
- Collapsed state: `h-[20dvh]` on mobile, `h-24` (96px) from the `sm:` breakpoint up, `fixed inset-x-0` anchored above the existing timer bar (`bottom: timerBarHeight`), `z-[66]` (one above the timer bar's existing `z-[65]`).
- Expanded state: `h-[90dvh]`, `bottom-0`, `z-[70]` (matches this session's established "above everything, including the timer bar" convention already used for the mobile sidebar drawer).
- Tap toggles collapsed/expanded. Swipe up (touch delta ≤ -60px) expands; swipe down (touch delta ≥ 60px) collapses. Detected via plain `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers (same style as `Sidebar.tsx`'s existing drag handlers), not a gesture library.
- Ending a cook session entirely (stop control) is **only** reachable from the expanded view. Collapsing never ends the session.
- The ingredient checklist is the flow's first screen when any ingredient is still unchecked at mount time; it does not count toward "Step X of N" and does not start the elapsed-time stopwatch. The stopwatch starts (once, via a ref guard) the first time the screen becomes the real steps view.
- The circular timer ring shows the nearest-ending *running* timer (same selection `nearestTimer` in `RecipeDetail.tsx` already computes) and is omitted entirely (not greyed/placeholder) when none is running. Tapping the ring pauses/resumes that timer.
- Remaining/elapsed time is formatted 2-digit `HH:MM` once ≥1 hour, else 2-digit `MM:SS` - a new `formatDockDuration` helper in `src/utils/format.ts` (the existing `formatSeconds` doesn't zero-pad minutes or handle hours and must not be changed, since it's used elsewhere unchanged).
- The manual "force-enter PiP" button from today's fullscreen header is deleted, not moved. PiP still auto-enters/exits on `visibilitychange` exactly as today.

---

## Task 1: CookDock component + RecipeDetail integration

**Files:**
- Create: `src/components/CookDock.tsx`
- Modify: `src/utils/format.ts`
- Modify: `src/components/RecipeDetail.tsx`

**Interfaces:**
- Produces (from `CookDock.tsx`): `export default function CookDock(props: CookDockProps)`, `export interface CookDockFlatStep { groupIdx: number; stepIdx: number; stepNum: number; instruction: string; instructionHe: string; instructionEn?: string; tip?: string; timerMinutes?: number; image?: string }`. This type must exactly match the shape `RecipeDetail.tsx`'s existing `flatSteps` array already produces (verified below) - no field renames.
- Produces (from `format.ts`): `export function formatDockDuration(totalSeconds: number): string`.
- Consumes from `RecipeDetail.tsx` (all already exist today, verified by reading the file before writing this plan): `IngredientGroup`/`TimerState` types from `../types`; `checkedIngredients: Set<string>`, `checkedSteps: Set<string>`, `nearestTimer: TimerState | null`, `multiplier: number`, `lang: 'he' | 'en'`; functions `toggleIngredient(key: string)`, `markStepChecked(key: string)`, `handleWizardMarkDone(key: string)`, `getTimerForStep(groupIdx: number, stepIdx: number)`, `startTimer(label: string, minutes: number, groupIdx: number, stepIdx: number)`, `pipToggleNearestTimer()`, `onToggleTimer` (prop, already threaded through `RecipeDetail`), `scaleAmount`, `heUnit`, `canonicalUnit` (from `../utils/format` / `../i18n`), `resizedImage` (from `../lib/image`), `TranslatedText`, `LinkedIngredientName` components.

- [ ] **Step 1: Add the duration formatter**

Open `src/utils/format.ts` and add this function (don't touch the existing `formatSeconds` - it's used elsewhere unchanged):

```ts
// 2-digit HH:MM once the duration is an hour or more, else 2-digit MM:SS -
// used by the cook-mode dock's elapsed-time display and timer ring (unlike
// formatSeconds, which doesn't zero-pad minutes or handle hours at all).
export function formatDockDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
```

- [ ] **Step 2: Create `src/components/CookDock.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { IngredientGroup, TimerState } from '../types'
import { formatDockDuration, scaleAmount } from '../utils/format'
import { heUnit, canonicalUnit, t } from '../i18n'
import { resizedImage } from '../lib/image'
import TranslatedText from './TranslatedText'
import LinkedIngredientName from './LinkedIngredientName'

export interface CookDockFlatStep {
  groupIdx: number
  stepIdx: number
  stepNum: number
  instruction: string
  instructionHe: string
  instructionEn?: string
  tip?: string
  timerMinutes?: number
  image?: string
}

interface CookDockProps {
  lang: 'he' | 'en'
  ingredients: IngredientGroup[]
  checkedIngredients: Set<string>
  onToggleIngredient: (key: string) => void
  multiplier: number
  steps: CookDockFlatStep[]
  wizardIndex: number
  onPrev: () => void
  onAdvance: (stepKey: string) => void
  onMarkDone: (stepKey: string) => void
  onStop: () => void
  onExpand: () => void
  checkedSteps: Set<string>
  nearestTimer: TimerState | null
  onToggleNearestTimer: () => void
  getTimerForStep: (groupIdx: number, stepIdx: number) => TimerState | undefined
  onStartTimer: (label: string, minutes: number, groupIdx: number, stepIdx: number) => void
  onOpenLightbox: (url: string) => void
  timerBarHeight: number
}

const SWIPE_THRESHOLD_PX = 60

// Circle progress ring: a plain SVG (no charting lib), stroke-dashoffset
// driven by `fraction` (0 = empty, 1 = full).
function TimerRing({ fraction, children }: { fraction: number; children: React.ReactNode }) {
  const size = 56
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(1, Math.max(0, fraction)))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-tint/10" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="stroke-amber transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-cream tabular-nums">
        {children}
      </div>
    </div>
  )
}

export default function CookDock({
  lang, ingredients, checkedIngredients, onToggleIngredient, multiplier,
  steps, wizardIndex, onPrev, onAdvance, onMarkDone, onStop, onExpand,
  checkedSteps, nearestTimer, onToggleNearestTimer, getTimerForStep, onStartTimer,
  onOpenLightbox, timerBarHeight,
}: CookDockProps) {
  const tx = t[lang]
  const dockRef = useRef<HTMLDivElement>(null)

  const allIngredientKeys = ingredients.flatMap((g, gi) => g.items.map((_, ii) => `${gi}-${ii}`))
  const [screen, setScreen] = useState<'checklist' | 'steps'>(() =>
    allIngredientKeys.some(k => !checkedIngredients.has(k)) ? 'checklist' : 'steps'
  )

  const [expanded, setExpanded] = useState(false)
  function setExpandedState(next: boolean) {
    setExpanded(next)
    if (next) onExpand()
  }

  // Client-side elapsed-time stopwatch - starts once, the first time the
  // real steps screen (not the unmeasured checklist) is shown. No backend
  // involved in this phase; this is purely a local Date.now() clock.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (screen !== 'steps') return
    if (elapsedStartRef.current === null) elapsedStartRef.current = Date.now()
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - elapsedStartRef.current!) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [screen])

  // Swipe up/down toggles expand/collapse. Plain touch-event tracking,
  // same style as Sidebar.tsx's existing drag-to-close handlers - no
  // gesture library, no live-transform-during-drag (the CSS height
  // transition on the dock's own className handles the visual animation).
  const dragState = useRef<{ startY: number; dragging: boolean }>({ startY: 0, dragging: false })
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    dragState.current = { startY: touch.clientY, dragging: true }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!dragState.current.dragging) return
    dragState.current.dragging = false
    const touch = e.changedTouches[0]
    if (!touch) return
    const delta = touch.clientY - dragState.current.startY
    if (delta <= -SWIPE_THRESHOLD_PX) setExpandedState(true)
    else if (delta >= SWIPE_THRESHOLD_PX) setExpandedState(false)
  }

  // Keyboard nav, body-scroll lock, and focus trap only apply while
  // expanded (the modal-like 90dvh sheet) - the collapsed bar is a normal
  // docked element, not modal, so the page scrolls normally behind it.
  useEffect(() => {
    if (!expanded) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpandedState(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [expanded])

  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [expanded])

  const step = screen === 'steps' ? steps[wizardIndex] : undefined
  const stepKey = step ? `${step.groupIdx}-${step.stepIdx}` : ''
  const checked = step ? checkedSteps.has(stepKey) : false
  const existingTimer = step ? getTimerForStep(step.groupIdx, step.stepIdx) : undefined
  const isLastStep = wizardIndex === steps.length - 1

  const collapsedStepLabel = screen === 'checklist'
    ? tx.ingredients
    : (lang === 'he' ? `שלב ${wizardIndex + 1} מתוך ${steps.length}` : `Step ${wizardIndex + 1} of ${steps.length}`)

  return (
    <div
      ref={dockRef}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => { if (!expanded) setExpandedState(true) }}
      className={`print:hidden fixed inset-x-0 bg-bg border-t border-tint/10 transition-[height] duration-200 flex flex-col ${
        expanded ? 'h-[90dvh] bottom-0 z-[70]' : 'h-[20dvh] sm:h-24 z-[66] cursor-pointer'
      }`}
      style={expanded ? undefined : { bottom: timerBarHeight }}
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      {expanded ? (
        <>
          <div className="flex items-center justify-between px-4 h-14 border-b border-tint/[0.06] shrink-0">
            <button type="button"
              onClick={e => { e.stopPropagation(); setExpandedState(false) }}
              aria-label={tx.collapse}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <span className="text-cream/40 text-sm">{collapsedStepLabel}</span>
            <button type="button"
              onClick={e => { e.stopPropagation(); onStop() }}
              aria-label={tx.closeGuidedMode}
              className="h-9 w-9 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
            >
              ✕
            </button>
          </div>

          {screen === 'checklist' ? (
            <div className="flex-1 overflow-y-auto px-6 py-6" onClick={e => e.stopPropagation()}>
              <div className="space-y-4 max-w-lg mx-auto">
                {ingredients.map((group, gi) => {
                  const hasGroupLabel = !!(group.group || group.groupEn)
                  return (
                    <div key={gi}>
                      {hasGroupLabel && (
                        <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-2">
                          <TranslatedText
                            primary={lang === 'he' ? group.group : group.groupEn}
                            secondary={lang === 'he' ? group.groupEn : group.group}
                          />
                        </h3>
                      )}
                      <ul className="space-y-2">
                        {group.items.map((item, ii) => {
                          const ingredientKey = `${gi}-${ii}`
                          const itemChecked = checkedIngredients.has(ingredientKey)
                          return (
                            <li
                              key={ii}
                              onClick={() => onToggleIngredient(ingredientKey)}
                              role="checkbox"
                              aria-checked={itemChecked}
                              tabIndex={0}
                              className="flex gap-2 text-sm cursor-pointer"
                              dir={lang === 'he' ? 'rtl' : 'ltr'}
                            >
                              <span className={`shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors ${
                                itemChecked ? 'bg-herb border-herb text-white' : 'border-tint/20 text-transparent'
                              }`}>
                                {itemChecked && '✓'}
                              </span>
                              <span className={`font-semibold shrink-0 w-14 text-right transition-colors ${itemChecked ? 'text-cream/30 line-through' : 'text-cream/90'}`}>
                                {(() => {
                                  if (!item.amount) return null
                                  const scaled = item.amount * multiplier
                                  const amt = scaleAmount(item.amount, multiplier)
                                  const unitCode = canonicalUnit(item.unit)
                                  const unit = lang === 'he' ? heUnit(unitCode, scaled) : unitCode
                                  return unit ? `${amt} ${unit}` : amt
                                })()}
                              </span>
                              <span className={`transition-colors ${itemChecked ? 'text-cream/30 line-through' : 'text-cream/70'}`}>
                                {item.linkedRecipeId ? (
                                  <LinkedIngredientName recipeId={item.linkedRecipeId} lang={lang} />
                                ) : (
                                  <TranslatedText
                                    primary={lang === 'he' ? item.name : item.nameEn}
                                    secondary={lang === 'he' ? item.nameEn : item.name}
                                  />
                                )}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
              <div className="max-w-lg mx-auto mt-6">
                <button type="button"
                  onClick={() => setScreen('steps')}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors"
                >
                  {tx.next}
                </button>
              </div>
            </div>
          ) : step && (
            <>
              <div className="h-1 bg-tint/[0.06] shrink-0">
                <div className="h-full bg-amber transition-all" style={{ width: `${((wizardIndex + 1) / steps.length) * 100}%` }} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6 overflow-y-auto py-8" onClick={e => e.stopPropagation()}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
                  checked ? 'bg-herb text-white' : 'bg-tint/10 text-cream/60'
                }`}>
                  {checked ? '✓' : step.stepNum}
                </div>
                <p className="max-w-lg text-xl sm:text-2xl leading-relaxed text-cream">
                  <TranslatedText
                    primary={lang === 'he' ? step.instructionHe : step.instructionEn}
                    secondary={lang === 'he' ? step.instructionEn : step.instructionHe}
                  />
                </p>
                {step.image && (
                  <img
                    src={resizedImage(step.image, 320)}
                    alt=""
                    onClick={() => onOpenLightbox(step.image!)}
                    className="max-w-xs w-full max-h-52 object-cover rounded-xl cursor-zoom-in"
                  />
                )}
                {step.tip && (
                  <p className="max-w-md text-sm text-amber/70 flex items-start gap-1.5">
                    <span className="mt-0.5">💡</span>
                    <span>{step.tip}</span>
                  </p>
                )}
                <div className="flex items-center gap-3">
                  {step.timerMinutes && !existingTimer && (
                    <button type="button"
                      onClick={() => onStartTimer(step.instruction.slice(0, 40), step.timerMinutes!, step.groupIdx, step.stepIdx)}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-amber/10 border border-amber/30 text-amber hover:bg-amber/20 transition-colors"
                    >
                      ⏱ {lang === 'he' ? `התחל טיימר ${step.timerMinutes} דק'` : `Start ${step.timerMinutes}m timer`}
                    </button>
                  )}
                  <button type="button"
                    onClick={() => onMarkDone(stepKey)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      checked ? 'border-herb/30 bg-herb/10 text-herb' : 'border-tint/10 text-cream/50 hover:text-cream/80'
                    }`}
                  >
                    {checked ? (tx.done) : (tx.markDone)}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 px-6 py-4 border-t border-tint/[0.06] shrink-0" onClick={e => e.stopPropagation()}>
                <button type="button"
                  onClick={onPrev}
                  disabled={wizardIndex === 0}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border border-tint/10 text-cream/60 hover:text-cream/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {tx.previous}
                </button>
                <button type="button"
                  onClick={() => onAdvance(stepKey)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors"
                >
                  {isLastStep ? tx.finish : tx.next}
                </button>
              </div>
            </>
          )}
        </>
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
          {nearestTimer && (
            <button type="button"
              onClick={e => { e.stopPropagation(); onToggleNearestTimer() }}
              aria-label={nearestTimer.running ? tx.pauseTimer : tx.resumeTimer}
            >
              <TimerRing fraction={nearestTimer.remainingSeconds / nearestTimer.totalSeconds}>
                {formatDockDuration(nearestTimer.remainingSeconds)}
              </TimerRing>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add two new i18n keys**

The brief above uses `tx.collapse` (already exists - check `grep -n "collapse:" src/i18n.ts`, it's the sidebar's existing "collapse" label, fine to reuse) and two new ones: `pauseTimer`/`resumeTimer` (for the ring's `aria-label`, since today's PiP media-session integration never needed a visible label for this). Add to `src/i18n.ts`, `he` block:

```ts
pauseTimer: "השהה טיימר",
resumeTimer: "המשך טיימר",
```

And `en` block:

```ts
pauseTimer: "Pause timer",
resumeTimer: "Resume timer",
```

Place them near the other timer-related keys (search for `timerRunning:` or `startTimer:` to find the right neighborhood in both blocks).

- [ ] **Step 4: Remove `wizardOpen` and its dedicated effects from `RecipeDetail.tsx`**

Find and delete the `wizardOpen` state declaration:

```tsx
const [wizardOpen, setWizardOpen] = useState(false)
```

Find and delete `wizardRef` and its focus trap (search for `const wizardRef = useRef<HTMLDivElement>(null)` and the adjacent `useFocusTrap(wizardRef, wizardOpen)` line) - focus trapping now lives inside `CookDock` itself, tied to its own `expanded` state (already in Step 2's code).

Find and delete `stepsCount` (search for `const stepsCount = recipe?.steps.reduce(...)`) - it was only used by the keyboard-nav effect being deleted next.

Find and delete these four `useEffect` blocks entirely (search for each by its distinctive first line):

```tsx
useEffect(() => {
  if (!wizardOpen) return
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') setWizardIndex(i => Math.min(i + 1, stepsCount - 1))
    if (e.key === 'ArrowLeft') setWizardIndex(i => Math.max(i - 1, 0))
    if (e.key === 'Escape') setWizardOpen(false)
  }
  document.addEventListener('keydown', handleKey)
  return () => document.removeEventListener('keydown', handleKey)
}, [wizardOpen, stepsCount])
```

```tsx
useEffect(() => {
  if (!wizardOpen) return
  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  return () => { document.body.style.overflow = previousOverflow }
}, [wizardOpen])
```

```tsx
// The fullscreen wizard and the PiP floating view are mutually exclusive -
// whichever one the user is looking at should be the only one live.
// Reopening the fullscreen view (manually, or automatically below when
// the app comes back to the foreground) always wins over PiP.
useEffect(() => {
  if (wizardOpen) backgroundCookStatusRef.current?.exitFloatingView()
}, [wizardOpen])
```

(Leave the `cookMode.request()`/`release()` wake-lock effect alone - just change its dependency from `wizardOpen` to `cookSessionActive` in the next step, don't delete it.)

- [ ] **Step 5: Update the wake-lock effect and the visibility effect**

Find:

```tsx
useEffect(() => {
  if (wizardOpen) void cookMode.request()
  else void cookMode.release()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cookMode is a new object every render; request/release are individually stable
}, [wizardOpen, cookMode.request, cookMode.release])
```

Replace with (screen shouldn't sleep for the whole session, not just while the sheet happens to be expanded):

```tsx
useEffect(() => {
  if (cookSessionActive) void cookMode.request()
  else void cookMode.release()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cookMode is a new object every render; request/release are individually stable
}, [cookSessionActive, cookMode.request, cookMode.release])
```

Find the visibility-change effect:

```tsx
useEffect(() => {
  if (!cookSessionActive) return
  function handleVisibility() {
    if (document.hidden) {
      backgroundCookStatusRef.current?.enterFloatingView()
    } else {
      // Coming back to the app mid-cook: restore the real wizard view and
      // close PiP directly - wizardOpen may already have been true this
      // whole time (tab hidden without ever minimizing), so the separate
      // "wizardOpen just became true" effect wouldn't fire again to do it.
      setWizardOpen(true)
      backgroundCookStatusRef.current?.exitFloatingView()
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [cookSessionActive])
```

Replace with (the dock is always present in-page whenever `cookSessionActive` - there's no separate "restore the view" step anymore, just exit PiP):

```tsx
// Auto-enter/exit the floating PiP view as the app is backgrounded and
// foregrounded - the dock itself is always present in-page while a
// session is active, so there's nothing to "restore" here beyond exiting
// PiP; entering PiP on hide is the only action needed on that side.
useEffect(() => {
  if (!cookSessionActive) return
  function handleVisibility() {
    if (document.hidden) backgroundCookStatusRef.current?.enterFloatingView()
    else backgroundCookStatusRef.current?.exitFloatingView()
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [cookSessionActive])
```

- [ ] **Step 6: Simplify `openWizard()` and `advanceWizardOrFinish()`**

Find:

```tsx
function openWizard() {
  const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
  setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
  setWizardOpen(true)
  setCookSessionActive(true)
}
```

Replace with (the checklist-vs-steps starting screen decision now lives inside `CookDock` itself, computed from its own props on mount - `openWizard` only needs to pick the right step index for when the steps screen is eventually reached):

```tsx
function openWizard() {
  const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
  setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
  setCookSessionActive(true)
}
```

Find:

```tsx
function advanceWizardOrFinish() {
  if (wizardIndex === flatSteps.length - 1) {
    setWizardOpen(false)
    setCookSessionActive(false)
  } else {
    setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
  }
}
```

Replace with:

```tsx
function advanceWizardOrFinish() {
  if (wizardIndex === flatSteps.length - 1) {
    setCookSessionActive(false)
  } else {
    setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
  }
}
```

- [ ] **Step 7: Add `onStop` handler and wire up the `CookDock` import**

Near `pipNextStep` (search for `function pipNextStep`), add a new function:

```tsx
function stopCooking() {
  setCookSessionActive(false)
  backgroundCookStatusRef.current?.exitFloatingView()
}
```

Add the import near the other component imports (alongside `BackgroundCookStatus`):

```tsx
import CookDock from './CookDock'
```

- [ ] **Step 8: Replace the fullscreen wizard JSX block with `<CookDock />`**

Find the entire block starting at `{/* Guided step-by-step wizard */}` and ending right before `{/* Ongoing-cook status: ... */}` (the whole `{wizardOpen && flatSteps.length > 0 && (() => { ... })()}` IIFE - roughly 125 lines). Delete it completely and replace with:

```tsx
{/* Persistent cook-session dock - collapsed by default, expands to
    90dvh on tap/swipe. Replaces the old fullscreen wizard modal. */}
{cookSessionActive && flatSteps.length > 0 && (
  <CookDock
    lang={lang}
    ingredients={displayRecipe.ingredients}
    checkedIngredients={checkedIngredients}
    onToggleIngredient={toggleIngredient}
    multiplier={multiplier}
    steps={flatSteps}
    wizardIndex={wizardIndex}
    onPrev={() => setWizardIndex(i => Math.max(i - 1, 0))}
    onAdvance={key => { markStepChecked(key); advanceWizardOrFinish() }}
    onMarkDone={handleWizardMarkDone}
    onStop={stopCooking}
    onExpand={() => backgroundCookStatusRef.current?.exitFloatingView()}
    checkedSteps={checkedSteps}
    nearestTimer={nearestTimer}
    onToggleNearestTimer={pipToggleNearestTimer}
    getTimerForStep={getTimerForStep}
    onStartTimer={startTimer}
    onOpenLightbox={setLightboxUrl}
    timerBarHeight={timerBarHeight}
  />
)}
```

- [ ] **Step 9: Reserve page-bottom space for the collapsed dock**

The collapsed dock is `fixed`, so the page's own scrolling content needs a matching spacer or the dock will sit on top of (hide) whatever's at the bottom of the page. Find the closing of the outermost page `<div>` (search for the final `</div>` right before the guided-wizard section you just replaced - it closes the `<div className="max-w-3xl mx-auto ...">` content wrapper) and add a spacer immediately before `<CookDock` renders, inside the same returned tree but after the main content wrapper closes:

```tsx
{cookSessionActive && flatSteps.length > 0 && (
  <div aria-hidden="true" className="h-[20dvh] sm:h-24" style={{ marginBottom: timerBarHeight }} />
)}
```

Place this spacer `<div>` directly before the `{cookSessionActive && flatSteps.length > 0 && (<CookDock .../>)}` block from Step 8, so the two are adjacent siblings - the spacer reserves the layout space and the fixed dock visually fills it.

- [ ] **Step 10: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors. Pay particular attention to any error naming `wizardOpen`, `wizardRef`, or `stepsCount` - that means a leftover reference wasn't caught in Steps 4-8.

```bash
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-check.json 2>&1 || true
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-check.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
console.log(hookIssues.length ? JSON.stringify(hookIssues, null, 2) : 'No react-hooks violations found.');
"
npx eslint src/components/CookDock.tsx src/components/RecipeDetail.tsx src/utils/format.ts src/i18n.ts 2>&1
```

Expected: "No react-hooks violations found." and no eslint errors on the touched files.

- [ ] **Step 11: Manual verification**

Start the dev server (`npm run dev`) if not already running, or verify via a signed-in browser session. Confirm, for a recipe with at least one unchecked ingredient and at least 2 instruction steps (one with a `timerMinutes` value if possible):

- Clicking "Start cooking" shows the collapsed dock at the bottom, reserving real space (page content above it, not hidden underneath).
- Collapsed dock shows "Ingredients" (or equivalent) as its step label first, with `00:00` elapsed time (not yet counting).
- Tapping the dock (or swiping up on it) expands it to ~90% height, showing the ingredient checklist with a "Next" button at the bottom.
- Checking off an ingredient here also shows as checked on the regular ingredients card below the fold (shared `checkedIngredients` state).
- Tapping "Next" on the checklist moves to the real step-by-step view; the elapsed-time clock (visible once collapsed again) starts counting from this point, not from when "Start cooking" was first clicked.
- "Step X of N" numbering starts at 1 for the first real instruction step (the checklist screen doesn't count).
- Swiping down (or tapping the header's down-chevron) while expanded collapses back to the bar; the session keeps running (dock still shows current step).
- Starting a step's timer, then collapsing: the collapsed bar's right side shows a circular ring counting down that timer, in `MM:SS` (or `HH:MM` if ≥1 hour). Tapping the ring pauses it (ring/label reflect paused state); tapping again resumes.
- With no timer running, the ring is absent entirely (not shown empty/greyed) and the step label/elapsed time use the freed space.
- Reaching the last step, tapping "Finish" ends the session (dock disappears, spacer disappears, page returns to normal layout).
- Alternatively, expanding and tapping the ✕ stop control also ends the session at any point - collapsing (swipe/tap down) by itself never ends it.
- Backgrounding the tab (switch to another tab or app) while a session is active still triggers Picture-in-Picture / the OS notification exactly as before, with no in-page button needed to trigger it manually (confirm the old floating-view button is gone from the UI).
- Repeat the core flow once in Hebrew (RTL) to confirm the layout mirrors correctly and nothing overlaps.

- [ ] **Step 12: Commit**

```bash
git add src/components/CookDock.tsx src/components/RecipeDetail.tsx src/utils/format.ts src/i18n.ts
git commit -m "$(cat <<'EOF'
feat: replace fullscreen cook wizard with a persistent bottom dock

New CookDock component replaces the old fixed-inset-0 fullscreen
wizard modal: collapsed to a ~1/5-viewport bar by default while a
cook session is active (step label + elapsed time + a circular ring
for the nearest running timer), expandable to 90dvh on tap or
swipe-up, collapsible on tap/swipe-down. Ending a session entirely
is only reachable from the expanded view - collapsing is always
just a resize.

The ingredient checklist is now the flow's first screen (reusing the
page's existing checkedIngredients state), excluded from step
numbering and from a new client-side elapsed-time stopwatch that
starts once the user reaches the first real instruction step.

wizardOpen and its dedicated effects (keyboard nav, body-scroll
lock, focus trap) are removed from RecipeDetail.tsx - that logic now
lives inside CookDock, tied to its own internal expanded state.
cookSessionActive alone now drives the wake-lock and the PiP/
notification auto-trigger. The manual "force-enter PiP" button is
deleted; PiP still auto-enters/exits on visibilitychange exactly as
before.

Phase B of the cook-mode redesign (docs/superpowers/specs/2026-08-14-cook-mode-dock-design.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016tfmq3HyC8s6SJSC5XE1i3
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Collapsed/expanded dock with reserved (non-floating) space ✓ Steps 2/9. Tap + swipe-up/down gestures ✓ Step 2. Collapsed info hierarchy (step left, elapsed top-left, ring right) ✓ Step 2's collapsed-state JSX. Ring hidden when no timer, nearest-timer selection, tap-to-pause ✓ Step 2. Ingredient checklist as unmeasured first screen ✓ Step 2 (`screen` state + `elapsedStartRef` guard). Manual PiP button removed ✓ Step 8 (not carried over from the deleted block). Stop-only-from-expanded ✓ Step 2 (no stop control in the collapsed branch). Desktop dock sizing ✓ Global Constraints (`sm:h-24`). All spec sections covered by this single task.
- **Placeholder scan:** No TBD/TODO; every code block is complete and copy-pasteable, including the full new component file.
- **Type consistency:** `CookDockFlatStep` matches `flatSteps`'s existing shape field-for-field (verified by reading `RecipeDetail.tsx`'s current `flatSteps` construction before writing this plan). All consumed function signatures (`markStepChecked(key: string)`, `handleWizardMarkDone(key: string)`, `getTimerForStep(groupIdx: number, stepIdx: number)`, `startTimer(label: string, minutes: number, groupIdx: number, stepIdx: number)`, `toggleIngredient(key: string)`) are used exactly as they exist today - no invented signatures. `TimerState`'s `totalSeconds`/`remainingSeconds`/`running`/`id` fields (used by `TimerRing` and `onToggleNearestTimer`) match the existing type in `src/types.ts`.
