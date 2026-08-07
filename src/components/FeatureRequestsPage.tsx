import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { useFeatureRequests } from '../hooks/useFeatureRequests'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { OWNER_USER_ID } from '../lib/admin'

type RequestStatus = 'pending' | 'approved' | 'denied' | 'in-progress' | 'needs-input' | 'pr-open' | 'closed'

function getStatus(labels: string[], state: string): RequestStatus {
  if (labels.includes('denied')) return 'denied'
  if (state === 'closed') return 'closed'
  if (labels.includes('claude-pr-open')) return 'pr-open'
  if (labels.includes('claude-needs-input')) return 'needs-input'
  if (labels.includes('claude-in-progress')) return 'in-progress'
  if (labels.includes('approved-for-claude')) return 'approved'
  return 'pending'
}

export default function FeatureRequestsPage() {
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const { userId } = useAuth()
  const { requests, loading, create, approve, unapprove, update, withdraw, deny } = useFeatureRequests()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [denyingNumber, setDenyingNumber] = useState<number | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const isOwner = userId === OWNER_USER_ID
  const [editingNumber, setEditingNumber] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    const ok = await create(title.trim(), description.trim())
    setSubmitting(false)
    if (ok) {
      setTitle('')
      setDescription('')
      showToast(lang === 'he' ? 'הבקשה נשלחה' : 'Request submitted')
    }
  }

  async function handleApprove(number: number) {
    const ok = await approve(number)
    if (ok) showToast(lang === 'he' ? 'אושר לביצוע' : 'Approved for Claude')
  }

  async function handleUnapprove(number: number) {
    const ok = await unapprove(number)
    if (ok) showToast(lang === 'he' ? 'האישור בוטל' : 'Approval removed')
  }

  function startEdit(r: { number: number, title: string, body: string }) {
    setEditingNumber(r.number)
    setEditTitle(r.title)
    setEditDescription(r.body.split('\n---\n')[0])
  }

  function cancelEdit() {
    setEditingNumber(null)
    setEditTitle('')
    setEditDescription('')
  }

  async function handleSaveEdit(number: number) {
    if (!editTitle.trim() || !editDescription.trim()) return
    setSavingEdit(true)
    const ok = await update(number, editTitle.trim(), editDescription.trim())
    setSavingEdit(false)
    if (ok) {
      cancelEdit()
      showToast(lang === 'he' ? 'הבקשה עודכנה' : 'Request updated')
    }
  }

  async function handleWithdraw(number: number) {
    if (!window.confirm(lang === 'he' ? 'לבטל את הבקשה?' : 'Withdraw this request?')) return
    const ok = await withdraw(number)
    if (ok) showToast(lang === 'he' ? 'הבקשה בוטלה' : 'Request withdrawn')
  }

  async function handleDeny(number: number) {
    if (!denyReason.trim()) return
    const ok = await deny(number, denyReason.trim())
    if (ok) {
      showToast(lang === 'he' ? 'הבקשה נדחתה' : 'Request denied')
      setDenyingNumber(null)
      setDenyReason('')
    }
  }

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-2">
          {lang === 'he' ? 'בקש פיצ\'ר חדש' : 'Feature Requests'}
        </h1>
        <p className="text-sm text-cream/40 mb-6">
          {isOwner
            ? (lang === 'he'
              ? 'יש לכם רעיון לתכונה שכדאי להוסיף? שתפו אותו כאן. כאן תוכלו לראות ולאשר את כל הבקשות.'
              : 'Have an idea for something the app should do? Suggest it here. You can see and approve every request below.')
            : (lang === 'he'
              ? 'יש לכם רעיון לתכונה שכדאי להוסיף? שתפו אותו כאן. למטה תראו רק את הבקשות שלכם ואת הסטטוס שלהן.'
              : "Have an idea for something the app should do? Suggest it here. Below you'll only see your own requests and their status.")}
        </p>

        <form onSubmit={handleSubmit} className="card p-5 space-y-3 mb-8">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={lang === 'he' ? 'כותרת קצרה' : 'Short title'}
            maxLength={120}
            required
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={lang === 'he' ? 'תארו את הרעיון...' : 'Describe the idea...'}
            rows={4}
            maxLength={2000}
            required
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none"
          />
          <button type="submit"
            disabled={submitting || !title.trim() || !description.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {submitting
              ? (lang === 'he' ? 'שולח...' : 'Submitting...')
              : (lang === 'he' ? 'שלח בקשה' : 'Submit request')}
          </button>
        </form>

        {loading ? (
          <p className="text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
        ) : requests.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'אין עדיין בקשות' : 'No requests yet'}
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map(r => {
              const status = getStatus(r.labels, r.state)
              const statusLabel: Record<RequestStatus, string> = {
                pending: lang === 'he' ? 'ממתין' : 'Pending',
                approved: lang === 'he' ? 'אושר' : 'Approved',
                denied: lang === 'he' ? 'נדחה' : 'Denied',
                'in-progress': lang === 'he' ? 'קלוד עובד על זה' : 'Claude is working on it',
                'needs-input': lang === 'he' ? 'דורש תשובה מכם' : 'Needs your input',
                'pr-open': lang === 'he' ? 'PR פתוח לבדיקה' : 'PR open for review',
                closed: lang === 'he' ? 'סגור' : 'Closed',
              }
              const statusClass: Record<RequestStatus, string> = {
                pending: 'bg-amber/10 text-amber',
                approved: 'bg-herb/10 text-herb',
                denied: 'bg-red-500/10 text-red-400',
                'in-progress': 'bg-amber/10 text-amber',
                'needs-input': 'bg-red-500/10 text-red-400',
                'pr-open': 'bg-herb/10 text-herb',
                closed: 'bg-tint/10 text-cream/30',
              }
              const canApprove = status === 'pending' || status === 'needs-input'
              const canEdit = status === 'pending' && r.submittedBy === userId
              const canDeny = status === 'pending' || status === 'needs-input'
              const isEditing = editingNumber === r.number
              return (
                <div key={r.number} className="card p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        maxLength={120}
                        required
                        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 outline-none focus:border-amber/30 transition-colors"
                      />
                      <textarea
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        rows={4}
                        maxLength={2000}
                        required
                        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 outline-none focus:border-amber/30 transition-colors resize-none"
                      />
                      <div className="flex items-center gap-3">
                        <button type="button"
                          onClick={() => handleSaveEdit(r.number)}
                          disabled={savingEdit || !editTitle.trim() || !editDescription.trim()}
                          className="btn-primary disabled:opacity-50 text-xs px-3 py-1.5"
                        >
                          {savingEdit
                            ? (lang === 'he' ? 'שומר...' : 'Saving...')
                            : (lang === 'he' ? 'שמור' : 'Save')}
                        </button>
                        <button type="button"
                          onClick={cancelEdit}
                          className="text-xs text-cream/40 hover:text-cream/70 transition-colors"
                        >
                          {lang === 'he' ? 'ביטול' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <h2 className="font-serif text-base font-medium text-cream">{r.title}</h2>
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass[status]}`}>
                          {statusLabel[status]}
                        </span>
                      </div>
                      <p className="text-sm text-cream/60 whitespace-pre-wrap mb-2">
                        {r.body.split('\n---\n')[0]}
                      </p>
                      {status === 'denied' && r.denialReason && (
                        <p className="text-sm text-red-400/80 whitespace-pre-wrap mb-2">
                          {lang === 'he' ? 'סיבת הדחייה: ' : 'Denial reason: '}{r.denialReason}
                        </p>
                      )}
                      {denyingNumber === r.number ? (
                        <div className="space-y-2">
                          <textarea
                            value={denyReason}
                            onChange={e => setDenyReason(e.target.value)}
                            placeholder={lang === 'he' ? 'למה נדחתה הבקשה?' : 'Why is this being denied?'}
                            rows={2}
                            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
                          />
                          <div className="flex gap-2">
                            <button type="button"
                              disabled={!denyReason.trim()}
                              onClick={() => handleDeny(r.number)}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                            >
                              {lang === 'he' ? 'שלח דחייה' : 'Send denial'}
                            </button>
                            <button type="button" onClick={() => { setDenyingNumber(null); setDenyReason('') }} className="text-xs text-cream/40 hover:text-cream/70 transition-colors">
                              {lang === 'he' ? 'ביטול' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                          <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="text-xs text-cream/30 hover:text-cream/60 transition-colors">
                            {lang === 'he' ? 'צפה ב-GitHub' : 'View on GitHub'} #{r.number}
                          </a>
                          {isOwner && canApprove && (
                            <button type="button"
                              onClick={() => handleApprove(r.number)}
                              className="text-xs font-semibold text-amber hover:text-amber/80 transition-colors"
                            >
                              {status === 'needs-input'
                                ? (lang === 'he' ? 'נסה שוב' : 'Retry')
                                : (lang === 'he' ? 'אשר לביצוע' : 'Approve for Claude')}
                            </button>
                          )}
                          {isOwner && status === 'approved' && (
                            <button type="button"
                              onClick={() => handleUnapprove(r.number)}
                              className="text-xs font-semibold text-cream/50 hover:text-cream/80 transition-colors"
                            >
                              {lang === 'he' ? 'בטל אישור' : 'Unapprove'}
                            </button>
                          )}
                          {isOwner && canDeny && (
                            <button type="button"
                              onClick={() => { setDenyingNumber(r.number); setDenyReason('') }}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                            >
                              {lang === 'he' ? 'דחה' : 'Deny'}
                            </button>
                          )}
                          {canEdit && (
                            <button type="button"
                              onClick={() => startEdit(r)}
                              className="text-xs font-semibold text-cream/50 hover:text-cream/80 transition-colors"
                            >
                              {lang === 'he' ? 'ערוך' : 'Edit'}
                            </button>
                          )}
                          {canEdit && (
                            <button type="button"
                              onClick={() => handleWithdraw(r.number)}
                              className="text-xs font-semibold text-red-400/70 hover:text-red-400 transition-colors"
                            >
                              {lang === 'he' ? 'בטל בקשה' : 'Withdraw'}
                            </button>
                          )}
                        </div>
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
