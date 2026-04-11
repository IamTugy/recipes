import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TimerState } from '../types'
import { formatSeconds } from '../utils/format'

interface TimerPanelProps {
  timers: TimerState[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onReset: (id: string) => void
}

function MiniRing({ timer }: { timer: TimerState }) {
  const pct = timer.remainingSeconds / timer.totalSeconds
  const r = 14
  const circ = 2 * Math.PI * r
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(var(--color-tint)/0.1)" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={timer.done ? 'rgb(var(--color-herb))' : timer.running ? 'rgb(var(--color-amber))' : 'rgb(var(--color-cream)/0.3)'}
        strokeWidth="3"
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        style={{ transition: 'stroke-dasharray 0.5s linear' }}
      />
    </svg>
  )
}

export default function TimerPanel({ timers, onToggle, onRemove, onReset }: TimerPanelProps) {
  // Index of which timer is shown in the bar when multiple are running
  const [primaryIdx, setPrimaryIdx] = useState(0)
  const [showAll, setShowAll] = useState(false)

  if (timers.length === 0) return null

  const idx = Math.min(primaryIdx, timers.length - 1)
  const primary = timers.find(t => t.running && !t.done) ?? timers[idx]

  function cycleTimer() {
    if (timers.length > 1) setPrimaryIdx(i => (i + 1) % timers.length)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Expanded list - slides up above bar */}
      <AnimatePresence>
        {showAll && timers.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-card/98 backdrop-blur-xl border-t border-tint/[0.06] shadow-2xl"
          >
            <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
              {timers.map(timer => (
                <div key={timer.id} className="flex items-center gap-3 py-1">
                  <MiniRing timer={timer} />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium text-cream">
                      {timer.done ? 'Done!' : formatSeconds(timer.remainingSeconds)}
                    </p>
                    <p className="text-xs text-cream/40 truncate">{timer.label}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!timer.done && (
                      <button
                        onClick={() => onToggle(timer.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/50 hover:text-cream hover:bg-tint/[0.06] transition-colors"
                      >
                        {timer.running
                          ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                          : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        }
                      </button>
                    )}
                    <button onClick={() => onReset(timer.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/30 hover:text-cream/60 hover:bg-tint/[0.06] transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                    <button onClick={() => onRemove(timer.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/30 hover:text-red-400 hover:bg-tint/[0.06] transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar at very top of the bar */}
      <div className="h-0.5 bg-tint/[0.06] relative">
        <div
          className="absolute left-0 top-0 h-full transition-all duration-500"
          style={{
            width: `${primary.done ? 100 : (primary.remainingSeconds / primary.totalSeconds) * 100}%`,
            background: primary.done ? 'rgb(var(--color-herb))' : 'rgb(var(--color-amber))',
          }}
        />
      </div>

      {/* Main bar */}
      <div className="bg-card/98 backdrop-blur-xl">
        {/* Safe area spacer for devices with home indicator */}
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">

          {/* Ring + time - tappable to cycle when multiple */}
          <button
            onClick={cycleTimer}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
            disabled={timers.length <= 1}
          >
            <MiniRing timer={primary} />
            <div className="min-w-0">
              <p className={`font-mono text-base font-semibold leading-none ${primary.done ? 'text-herb' : 'text-cream'}`}>
                {primary.done ? 'Done!' : formatSeconds(primary.remainingSeconds)}
              </p>
              <p className="text-xs text-cream/40 truncate mt-0.5 max-w-[180px]">{primary.label}</p>
            </div>
          </button>

          {/* Multiple timers indicator */}
          {timers.length > 1 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="text-[11px] text-cream/40 bg-tint/[0.06] border border-tint/[0.08] px-2 py-1 rounded-full hover:text-cream/70 transition-colors shrink-0"
            >
              {showAll ? 'hide' : `+${timers.length - 1}`}
            </button>
          )}

          {/* Controls for primary timer */}
          <div className="flex items-center gap-0.5 shrink-0">
            {!primary.done && (
              <button
                onClick={() => onToggle(primary.id)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-cream/60 hover:text-cream hover:bg-tint/[0.06] transition-colors"
              >
                {primary.running
                  ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                  : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                }
              </button>
            )}
            <button
              onClick={() => onReset(primary.id)}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-cream/35 hover:text-cream/70 hover:bg-tint/[0.06] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button
              onClick={() => onRemove(primary.id)}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-cream/30 hover:text-red-400 hover:bg-tint/[0.06] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* iOS home indicator safe area */}
        <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  )
}
