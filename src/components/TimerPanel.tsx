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

function TimerRing({ timer }: { timer: TimerState }) {
  const pct = timer.remainingSeconds / timer.totalSeconds
  const r = 20
  const circ = 2 * Math.PI * r
  const dash = circ * pct

  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle
        cx="28" cy="28" r={r} fill="none"
        stroke={timer.done ? '#4a7c59' : timer.running ? '#f59e0b' : '#a08c7a'}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dasharray 0.5s linear' }}
      />
      <text x="28" y="32" textAnchor="middle" fontSize="10" fill="white" fontFamily="JetBrains Mono, monospace">
        {timer.done ? '✓' : formatSeconds(timer.remainingSeconds)}
      </text>
    </svg>
  )
}

export default function TimerPanel({ timers, onToggle, onRemove, onReset }: TimerPanelProps) {
  const [expanded, setExpanded] = useState(false)

  if (timers.length === 0) return null

  // Most urgent: first running timer, or first timer
  const primary = timers.find(t => t.running && !t.done) ?? timers[0]

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
      style={{ width: 'calc(100vw - 2rem)', maxWidth: '28rem' }}
    >
      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="w-full bg-surface/97 backdrop-blur-xl border border-tint/10 rounded-2xl shadow-2xl p-3"
          >
            <div className="flex flex-col gap-2">
              {timers.map(timer => (
                <div
                  key={timer.id}
                  className="flex items-center gap-3 bg-tint/[0.03] rounded-xl px-3 py-2"
                >
                  <TimerRing timer={timer} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cream truncate">{timer.label}</p>
                    <p className={`text-xs ${timer.done ? 'text-herb' : 'text-cream/40'}`}>
                      {timer.done ? 'Done!' : timer.running ? 'Running' : 'Paused'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!timer.done && (
                      <button
                        onClick={() => onToggle(timer.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-cream/60 hover:text-cream hover:bg-tint/10 transition-colors"
                      >
                        {timer.running ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => onReset(timer.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-cream/40 hover:text-cream/70 hover:bg-tint/10 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onRemove(timer.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-cream/30 hover:text-red-400 hover:bg-tint/10 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact pill - always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2.5 px-4 py-2.5 bg-surface/97 backdrop-blur-xl border border-tint/10 rounded-full shadow-2xl hover:border-amber/30 transition-colors"
      >
        {/* Pulse dot */}
        <span className={`w-2 h-2 rounded-full shrink-0 ${primary.done ? 'bg-herb' : primary.running ? 'bg-amber animate-pulse' : 'bg-cream/30'}`} />

        {/* Time */}
        <span className="font-mono text-sm text-cream tabular-nums">
          {primary.done ? 'Done!' : formatSeconds(primary.remainingSeconds)}
        </span>

        {/* Extra timers count */}
        {timers.length > 1 && (
          <span className="text-[11px] text-cream/40">+{timers.length - 1}</span>
        )}

        {/* Divider */}
        <span className="w-px h-4 bg-tint/10 mx-0.5" />

        {/* Label truncated */}
        <span className="text-xs text-cream/40 truncate max-w-[100px]">{primary.label}</span>

        {/* Expand chevron */}
        <svg
          className={`w-3.5 h-3.5 text-cream/30 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </motion.div>
  )
}
