import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { usePendingSubmissions, approveSubmission, rejectSubmission } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { OWNER_USER_ID } from '../lib/admin'

export default function AdminSubmissionsPage() {
  const { lang } = useLanguage()
  const { userId, getToken } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const { recipes, loading, reload } = usePendingSubmissions()
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [rejectingSlug, setRejectingSlug] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const isAdmin = userId === OWNER_USER_ID

  if (!isAdmin) {
    return (
      <div className="min-h-dvh bg-bg pt-20 px-4 text-center text-cream/40 text-sm">
        {lang === 'he' ? 'הדף הזה מיועד למנהלים בלבד' : 'Admins only'}
      </div>
    )
  }

  async function handleApprove(slug: string) {
    setBusySlug(slug)
    try {
      await approveSubmission(slug, getToken)
      showToast(lang === 'he' ? 'המתכון פורסם' : 'Recipe published')
      await reload()
    } catch {
      showToast(lang === 'he' ? 'האישור נכשל' : 'Approval failed', 'error')
    } finally {
      setBusySlug(null)
    }
  }

  async function handleReject(slug: string) {
    if (!rejectComment.trim()) return
    setBusySlug(slug)
    try {
      await rejectSubmission(slug, rejectComment.trim(), getToken)
      showToast(lang === 'he' ? 'המתכון נדחה' : 'Recipe rejected')
      setRejectingSlug(null)
      setRejectComment('')
      await reload()
    } catch {
      showToast(lang === 'he' ? 'הדחייה נכשלה' : 'Rejection failed', 'error')
    } finally {
      setBusySlug(null)
    }
  }

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {lang === 'he' ? 'תור אישורים' : 'Review Queue'}
        </h1>

        {loading ? (
          <p className="text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'אין בקשות ממתינות' : 'No pending submissions'}
          </p>
        ) : (
          <div className="space-y-3">
            {recipes.map(r => (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <button type="button" onClick={() => navigate(`/recipes/${r.id}`)} className="font-serif text-base font-medium text-cream hover:text-amber transition-colors text-start">
                    {r.title}
                  </button>
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber/10 text-amber">
                    {lang === 'he' ? 'ממתין' : 'Pending'}
                  </span>
                </div>
                <p className="text-sm text-cream/60 line-clamp-2 mb-3">{r.description}</p>

                {rejectingSlug === r.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectComment}
                      onChange={e => setRejectComment(e.target.value)}
                      placeholder={lang === 'he' ? 'מה צריך לתקן?' : "What needs to change?"}
                      rows={2}
                      className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
                    />
                    <div className="flex gap-2">
                      <button type="button"
                        disabled={busySlug === r.id || !rejectComment.trim()}
                        onClick={() => handleReject(r.id)}
                        className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                      >
                        {lang === 'he' ? 'שלח דחייה' : 'Send rejection'}
                      </button>
                      <button type="button" onClick={() => { setRejectingSlug(null); setRejectComment('') }} className="text-xs text-cream/40 hover:text-cream/70 transition-colors">
                        {lang === 'he' ? 'ביטול' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button type="button"
                      disabled={busySlug === r.id}
                      onClick={() => handleApprove(r.id)}
                      className="text-xs font-semibold text-herb hover:text-herb/80 disabled:opacity-40 transition-colors"
                    >
                      {lang === 'he' ? 'אשר ופרסם' : 'Approve & publish'}
                    </button>
                    <button type="button"
                      disabled={busySlug === r.id}
                      onClick={() => setRejectingSlug(r.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                    >
                      {lang === 'he' ? 'דחה' : 'Reject'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
