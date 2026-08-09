import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSubmissionsFeed } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import type { QualityFinding } from '../types'

const SEVERITY_CLASS: Record<QualityFinding['severity'], string> = {
  critical: 'bg-red-500/10 text-red-400',
  major: 'bg-amber/10 text-amber',
  minor: 'bg-tint/10 text-cream/50',
}

export default function SubmissionsPage() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const { recipes, loading } = useSubmissionsFeed()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-2">
          {lang === 'he' ? 'הגשות' : 'Submissions'}
        </h1>
        <p className="text-sm text-cream/40 mb-6">
          {lang === 'he'
            ? 'כל הבדיקות האוטומטיות של AI על מתכונים שהוגשו לאחרונה - פורסמו או נדחו וממתינים לתיקון.'
            : 'Recent AI quality-review outcomes across all recently submitted recipes - published, or rejected and awaiting a fix.'}
        </p>

        {loading ? (
          <p className="text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'אין הגשות עדיין' : 'No submissions yet'}
          </p>
        ) : (
          <div className="space-y-3">
            {recipes.map(r => {
              const review = r.qualityReview
              if (!review) return null
              const passed = r.status === 'published'
              const isExpanded = expanded.has(r.id)
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <button type="button" onClick={() => navigate(`/recipes/${r.id}`)} className="font-serif text-base font-medium text-cream hover:text-amber transition-colors text-start">
                      {r.title}
                    </button>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-xs font-bold ${passed ? 'text-herb' : 'text-red-400'}`}>
                        {review.score}%
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        passed ? 'bg-herb/10 text-herb' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {passed
                          ? (lang === 'he' ? 'פורסם' : 'Published')
                          : (lang === 'he' ? 'נדחה' : 'Rejected')}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-cream/30 mb-2">
                    {r.ownerName ?? r.ownerId} · {new Date(review.checkedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
                  </p>

                  {review.findings.length > 0 && (
                    <>
                      <button type="button" onClick={() => toggle(r.id)} className="text-xs text-cream/40 hover:text-cream/70 transition-colors">
                        {isExpanded
                          ? (lang === 'he' ? 'הסתר ממצאים' : 'Hide findings')
                          : (lang === 'he' ? `הצג ${review.findings.length} ממצאים` : `Show ${review.findings.length} finding${review.findings.length > 1 ? 's' : ''}`)}
                      </button>
                      {isExpanded && (
                        <ul className="mt-2 space-y-1.5">
                          {review.findings.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEVERITY_CLASS[f.severity]}`}>
                                {f.severity}
                              </span>
                              <span>{f.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
