import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useCookRecipeHistory } from '../hooks/useCookRecipeHistory'
import { useLanguage } from '../hooks/useLanguage'
import { formatTime } from '../utils/format'
import { t } from '../i18n'

export default function CookHistoryRecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { history, loading } = useCookRecipeHistory(recipeId)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const trendData = history?.sessions
    .slice()
    .reverse()
    .map((s, i) => ({ index: i + 1, minutes: Math.round(s.totalDurationSeconds / 60) })) ?? []

  const totalTimeSeconds = history?.sessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0) ?? 0
  const averageMinutes = history && history.sessions.length > 0
    ? Math.round(totalTimeSeconds / history.sessions.length / 60)
    : 0

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/cook-history" className="text-xs text-cream/40 hover:text-cream/70 transition-colors mb-4 inline-block">
          ← {tx.cookHistory}
        </Link>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : !history ? (
          <p className="text-cream/30 text-sm">{tx.noCookHistoryYet}</p>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="font-serif text-2xl font-bold text-cream">{history.recipeTitle}</h1>
              {recipeId && (
                <Link to={`/recipes/${recipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors shrink-0">
                  {tx.backToRecipe}
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-amber">{history.sessions.length}</div>
                <div className="text-xs text-cream/40 mt-1">{tx.timesCooked2}</div>
              </div>
              <div className="card p-4 text-center">
                <div className="text-2xl font-bold text-amber">{formatTime(averageMinutes)}</div>
                <div className="text-xs text-cream/40 mt-1">{tx.averageTime}</div>
              </div>
            </div>

            {trendData.length > 1 && (
              <div className="card p-4">
                <ResponsiveContainer width="100%" height={140} className="text-cream/40">
                  <BarChart data={trendData}>
                    <XAxis dataKey="index" stroke="currentColor" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="currentColor" fontSize={10} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="minutes" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-2">
              {history.sessions.map((session, i) => (
                <div key={`${session.finishedAt}-${i}`} className="card p-3">
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    aria-expanded={expandedIndex === i}
                    className="w-full flex items-center justify-between text-sm text-cream/80"
                  >
                    <span className="flex items-center gap-1.5">
                      {new Date(session.finishedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                      {session.steps.length > 0 && (
                        <svg
                          className={`w-3 h-3 text-cream/30 transition-transform ${expandedIndex === i ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </span>
                    <span className="text-cream/40 text-xs">{formatTime(Math.round(session.totalDurationSeconds / 60))}</span>
                  </button>
                  {expandedIndex === i && session.steps.length > 0 && (
                    <div className="mt-3">
                      <ResponsiveContainer width="100%" height={100} className="text-cream/40">
                        <BarChart data={session.steps.map(s => ({ label: tx.stepShort(s.stepNum), seconds: s.durationSeconds }))}>
                          <XAxis dataKey="label" stroke="currentColor" fontSize={9} tickLine={false} axisLine={false} />
                          <YAxis stroke="currentColor" fontSize={9} tickLine={false} axisLine={false} width={24} />
                          <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 12 }} />
                          <Bar dataKey="seconds" fill="#d97706" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
