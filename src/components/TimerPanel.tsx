import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimerState } from '../types'
import { formatSeconds } from '../utils/format'
import { useLanguage } from '../hooks/useLanguage'

interface TimerPanelProps {
  timers: TimerState[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onReset: (id: string) => void
}

function MiniRing({ timer, size = 36 }: { timer: TimerState; size?: number }) {
  const r = size / 2 - 4
  const circ = 2 * Math.PI * r
  const pct = timer.remainingSeconds / timer.totalSeconds
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgb(var(--color-tint)/0.1)" strokeWidth="3" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={timer.done ? 'rgb(var(--color-herb))' : timer.running ? 'rgb(var(--color-amber))' : 'rgb(var(--color-cream)/0.3)'}
        strokeWidth="3"
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.5s linear' }}
      />
    </svg>
  )
}

function TimerControls({ timer, onToggle, onReset, onRemove }: {
  timer: TimerState
  onToggle: (id: string) => void
  onReset: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {!timer.done && (
        <button type="button"
          onClick={() => onToggle(timer.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream hover:bg-tint/[0.06] transition-colors"
        >
          {timer.running
            ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
            : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          }
        </button>
      )}
      <button type="button" onClick={() => onReset(timer.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/30 hover:text-cream/60 hover:bg-tint/[0.06] transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
      <button type="button" onClick={() => onRemove(timer.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/30 hover:text-red-400 hover:bg-tint/[0.06] transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

function playDoneSound() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const notes = [523, 659, 784, 1047] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.15
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  } catch { /* AudioContext unavailable */ }
}

export default function TimerPanel({ timers, onToggle, onRemove, onReset }: TimerPanelProps) {
  const { lang } = useLanguage()
  const [mobileIdx, setMobileIdx] = useState(0)
  const prevDoneIds = useRef<Set<string>>(new Set(timers.filter(t => t.done).map(t => t.id)))

  // Play sound (and notify, if the tab is backgrounded) when a timer newly completes
  useEffect(() => {
    timers.forEach(t => {
      if (t.done && !prevDoneIds.current.has(t.id)) {
        playDoneSound()
        if (
          document.hidden &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          new Notification(lang === 'he' ? 'הטיימר הסתיים!' : 'Timer done!', { body: t.label })
        }
      }
    })
    prevDoneIds.current = new Set(timers.filter(t => t.done).map(t => t.id))
  }, [timers, lang])

  // Sort: running (soonest end first), then paused (soonest first), then done
  const sorted = useMemo(() => [...timers].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.running !== b.running) return a.running ? -1 : 1
    return a.remainingSeconds - b.remainingSeconds
  }), [timers])

  if (timers.length === 0) return null

  const safeIdx = Math.min(mobileIdx, sorted.length - 1)
  const mobileTimer = sorted[safeIdx]

  // Progress bar uses the most urgent running timer
  const progressTimer = sorted.find(t => t.running && !t.done) ?? sorted[0]

  return (
    <div className="print:hidden fixed bottom-0 left-0 right-0 z-[65]">
      {/* Progress bar */}
      <div className="h-0.5 bg-tint/[0.06] relative">
        <div
          className="absolute left-0 top-0 h-full transition-all duration-500"
          style={{
            width: `${progressTimer.done ? 100 : (progressTimer.remainingSeconds / progressTimer.totalSeconds) * 100}%`,
            background: progressTimer.done ? 'rgb(var(--color-herb))' : 'rgb(var(--color-amber))',
          }}
        />
      </div>

      <div className="bg-card/98 backdrop-blur-xl border-t border-tint/[0.06]">

        {/* ── Desktop: show all timers side by side ── */}
        <div className="hidden sm:block">
          <div className="max-w-6xl mx-auto px-6 py-2">
            <div className="flex items-center gap-4 overflow-x-auto">
              {sorted.map(timer => (
                <div key={timer.id} className="flex items-center gap-2.5 shrink-0 bg-tint/[0.03] border border-tint/[0.07] rounded-xl px-3 py-1.5 min-w-[200px]">
                  <MiniRing timer={timer} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-mono text-sm font-semibold leading-none ${timer.done ? 'text-herb' : 'text-cream'}`}>
                      {timer.done ? 'Done!' : formatSeconds(timer.remainingSeconds)}
                    </p>
                    <p className="text-[11px] text-cream/40 truncate mt-0.5 max-w-[130px]">{timer.label}</p>
                  </div>
                  <TimerControls timer={timer} onToggle={onToggle} onReset={onReset} onRemove={onRemove} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Mobile: single timer with swipe arrows ── */}
        <div className="sm:hidden">
          <div className="px-4 h-16 flex items-center gap-3">
            {/* Prev arrow */}
            {sorted.length > 1 && (
              <button type="button"
                onClick={() => setMobileIdx(i => (i - 1 + sorted.length) % sorted.length)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-cream/30 hover:text-cream/60 hover:bg-tint/[0.06] transition-colors shrink-0"
              >
                <svg className={`w-4 h-4 ${lang === 'he' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
            )}

            <MiniRing timer={mobileTimer} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`font-mono text-base font-semibold leading-none ${mobileTimer.done ? 'text-herb' : 'text-cream'}`}>
                  {mobileTimer.done ? 'Done!' : formatSeconds(mobileTimer.remainingSeconds)}
                </p>
                {sorted.length > 1 && (
                  <span className="text-[10px] text-cream/30 font-mono">{safeIdx + 1}/{sorted.length}</span>
                )}
              </div>
              <p className="text-xs text-cream/40 truncate mt-0.5 max-w-[160px]">{mobileTimer.label}</p>
            </div>

            <TimerControls timer={mobileTimer} onToggle={onToggle} onReset={onReset} onRemove={onRemove} />

            {/* Next arrow */}
            {sorted.length > 1 && (
              <button type="button"
                onClick={() => setMobileIdx(i => (i + 1) % sorted.length)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-cream/30 hover:text-cream/60 hover:bg-tint/[0.06] transition-colors shrink-0"
              >
                <svg className={`w-4 h-4 ${lang === 'he' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            )}
          </div>
        </div>

        <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  )
}
