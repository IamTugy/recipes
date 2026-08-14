import { useEffect, useRef, useState } from 'react'
import type { IngredientGroup, TimerState } from '../types'
import { formatDockDuration, scaleAmount } from '../utils/format'
import { heUnit, canonicalUnit, t } from '../i18n'
import { resizedImage } from '../lib/image'
import { useFocusTrap } from '../hooks/useFocusTrap'
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
  onStepEntered: (stepKey: string, stepNum: number) => void
  onExpand: () => void
  checkedSteps: Set<string>
  nearestTimer: TimerState | null
  onToggleNearestTimer: () => void
  getTimerForStep: (groupIdx: number, stepIdx: number) => TimerState | undefined
  onStartTimer: (label: string, minutes: number, groupIdx: number, stepIdx: number) => void
  onOpenLightbox: (url: string) => void
  timerBarHeight: number
  lightboxOpen: boolean
  elapsedBaselineMs?: number
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
  steps, wizardIndex, onPrev, onAdvance, onMarkDone, onStop, onStepEntered, onExpand,
  checkedSteps, nearestTimer, onToggleNearestTimer, getTimerForStep, onStartTimer,
  onOpenLightbox, timerBarHeight, lightboxOpen, elapsedBaselineMs,
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

  // The ring should disappear for a paused timer the user never interacted
  // with here (e.g. some unrelated leftover timer becoming "nearest" by
  // remaining time), but must stay visible - dimmed/paused - for the exact
  // timer the user just paused via this ring, until it resumes or a
  // different timer becomes the nearest *running* one. Tracking the last
  // timer id we saw running (rather than trusting `nearestTimer.running`
  // alone) is what makes that distinction.
  const lastRunningTimerIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (nearestTimer?.running) lastRunningTimerIdRef.current = nearestTimer.id
  }, [nearestTimer])
  const displayedTimer = nearestTimer && (nearestTimer.running || nearestTimer.id === lastRunningTimerIdRef.current)
    ? nearestTimer
    : null

  // Suspended while the photo lightbox is open on top of the dock - it has
  // its own focus trap, and without this both trap/Escape handlers would
  // fire together (Escape would close the lightbox AND collapse the dock).
  useFocusTrap(dockRef, expanded && !lightboxOpen)

  // Client-side elapsed-time stopwatch - starts once, the first time the
  // real steps screen (not the unmeasured checklist) is shown. No backend
  // involved in this phase; this is purely a local Date.now() clock.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // Resumed sessions (Phase D) pass their real start time here so the
  // stopwatch continues from the correct offset instead of restarting at
  // 0 - a fresh (non-resumed) session gets undefined and behaves exactly
  // as before (Date.now() the first time the real steps screen is shown).
  const elapsedStartRef = useRef<number | null>(elapsedBaselineMs ?? null)
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
      // The lightbox has its own Escape handler while it's open on top of
      // the dock - let it own Escape alone rather than also collapsing the
      // dock underneath in the same keypress.
      if (e.key === 'Escape' && !lightboxOpen) {
        setExpandedState(false)
        return
      }
      if (screen !== 'steps') return
      if (e.key === 'ArrowRight') {
        const next = steps[wizardIndex + 1]
        if (next) onStepEntered(`${next.groupIdx}-${next.stepIdx}`, next.stepNum)
        onAdvance(`${steps[wizardIndex].groupIdx}-${steps[wizardIndex].stepIdx}`)
      }
      if (e.key === 'ArrowLeft') {
        const prev = steps[wizardIndex - 1]
        if (prev) onStepEntered(`${prev.groupIdx}-${prev.stepIdx}`, prev.stepNum)
        onPrev()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setExpandedState/onStepEntered are new functions every render; they don't close over stale state
  }, [expanded, lightboxOpen, screen, steps, wizardIndex, onAdvance, onPrev])

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
      aria-label={expanded ? tx.instructions : undefined}
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
            <div
              className="flex-1 overflow-y-auto px-6 py-6"
              onClick={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
            >
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
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onToggleIngredient(ingredientKey)
                                }
                              }}
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
                                {(item.note || item.noteEn) && (
                                  <span className="text-cream/40 italic">
                                    {' ('}
                                    <TranslatedText
                                      primary={lang === 'he' ? item.note : item.noteEn}
                                      secondary={lang === 'he' ? item.noteEn : item.note}
                                    />
                                    {')'}
                                  </span>
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
                  onClick={() => {
                    setScreen('steps')
                    const first = steps[wizardIndex]
                    if (first) onStepEntered(`${first.groupIdx}-${first.stepIdx}`, first.stepNum)
                  }}
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
              <div
                className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6 overflow-y-auto py-8"
                onClick={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}
              >
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
                    onClick={() => {
                      if (!checked && !isLastStep) {
                        const next = steps[wizardIndex + 1]
                        if (next) onStepEntered(`${next.groupIdx}-${next.stepIdx}`, next.stepNum)
                      }
                      onMarkDone(stepKey)
                    }}
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
                  onClick={() => {
                    const prev = steps[wizardIndex - 1]
                    if (prev) onStepEntered(`${prev.groupIdx}-${prev.stepIdx}`, prev.stepNum)
                    onPrev()
                  }}
                  disabled={wizardIndex === 0}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border border-tint/10 text-cream/60 hover:text-cream/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {tx.previous}
                </button>
                <button type="button"
                  onClick={() => {
                    if (!isLastStep) {
                      const next = steps[wizardIndex + 1]
                      if (next) onStepEntered(`${next.groupIdx}-${next.stepIdx}`, next.stepNum)
                    }
                    onAdvance(stepKey)
                  }}
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
    </div>
  )
}
