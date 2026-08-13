import { useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { useFeatureRequests } from '../hooks/useFeatureRequests'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { OWNER_USER_ID } from '../lib/admin'
import { embedFeatureRequestImage, extractFeatureRequestImage } from '../lib/featureRequestImage'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'
import AppSelect from './ui/AppSelect'
import { t } from "../i18n";

type RequestStatus = 'pending' | 'approved' | 'denied' | 'in-progress' | 'needs-input' | 'pr-open' | 'closed'
type SortMode = 'status' | 'recent'

function getStatus(labels: string[], state: string): RequestStatus {
  if (labels.includes('denied')) return 'denied'
  if (state === 'closed') return 'closed'
  if (labels.includes('claude-pr-open')) return 'pr-open'
  if (labels.includes('claude-needs-input')) return 'needs-input'
  if (labels.includes('claude-in-progress')) return 'in-progress'
  if (labels.includes('approved-for-claude')) return 'approved'
  return 'pending'
}

// In review -> ongoing -> approved -> pending -> done -> denied. needs-input
// isn't one of those six names, but it's part of the same "Claude is
// actively working this" cluster as in-review/ongoing, so it sits right
// alongside them rather than off on its own.
const STATUS_ORDER: Record<RequestStatus, number> = {
  'pr-open': 0,
  'needs-input': 1,
  'in-progress': 2,
  approved: 3,
  pending: 4,
  closed: 5,
  denied: 6,
}

export default function FeatureRequestsPage() {
  const { lang } = useLanguage()
        const tx = t[lang]
  const { showToast } = useToast()
  const { userId, getToken } = useAuth()
  const { requests, loading, create, approve, unapprove, update, withdraw, deny } = useFeatureRequests()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [denyingNumber, setDenyingNumber] = useState<number | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const isOwner = userId === OWNER_USER_ID
  const [editingNumber, setEditingNumber] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null)
  const [editPhotoUploading, setEditPhotoUploading] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('status')
  const uploadIdRef = useRef(`new-${Date.now()}`)

  // Secondary sort is always most-recent-first (higher issue number = newer,
  // same ordering as createdAt) - "status" only decides the primary bucket,
  // "recent" ignores status and sorts across all requests by recency alone.
  const sortedRequests = useMemo(() => {
    return [...requests].sort((a, b) => {
      if (sortMode === 'status') {
        const statusDiff = STATUS_ORDER[getStatus(a.labels, a.state)] - STATUS_ORDER[getStatus(b.labels, b.state)]
        if (statusDiff !== 0) return statusDiff
      }
      return b.number - a.number
    })
  }, [requests, sortMode])

  async function uploadPhoto(uploadId: string, file: File): Promise<string | null> {
    const token = await getToken()
    const presignRes = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ recipeId: uploadId, contentType: file.type, purpose: 'feature-request' }),
    })
    if (!presignRes.ok) return null
    const { uploadUrl, publicUrl } = await presignRes.json()
    const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    return uploadResult.ok ? publicUrl : null
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return
    setPhotoUploading(true)
    try {
      const publicUrl = await uploadPhoto(uploadIdRef.current, file)
      if (publicUrl) setPhotoUrl(publicUrl)
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleEditPhotoSelect(number: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return
    setEditPhotoUploading(true)
    try {
      const publicUrl = await uploadPhoto(`edit-${number}`, file)
      if (publicUrl) setEditPhotoUrl(publicUrl)
    } finally {
      setEditPhotoUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    const ok = await create(title.trim(), embedFeatureRequestImage(description.trim(), photoUrl))
    setSubmitting(false)
    if (ok) {
      setTitle('')
      setDescription('')
      setPhotoUrl(null)
      uploadIdRef.current = `new-${Date.now()}`
      showToast(tx.requestSubmitted)
    }
  }

  async function handleApprove(number: number) {
    const ok = await approve(number)
    if (ok) showToast(tx.approvedForClaude)
  }

  async function handleUnapprove(number: number) {
    const ok = await unapprove(number)
    if (ok) showToast(tx.approvalRemoved)
  }

  function startEdit(r: { number: number, title: string, body: string }) {
    const { text, imageUrl } = extractFeatureRequestImage(r.body.split('\n---\n')[0])
    setEditingNumber(r.number)
    setEditTitle(r.title)
    setEditDescription(text)
    setEditPhotoUrl(imageUrl)
  }

  function cancelEdit() {
    setEditingNumber(null)
    setEditTitle('')
    setEditDescription('')
    setEditPhotoUrl(null)
  }

  async function handleSaveEdit(number: number) {
    if (!editTitle.trim() || !editDescription.trim()) return
    setSavingEdit(true)
    const ok = await update(number, editTitle.trim(), embedFeatureRequestImage(editDescription.trim(), editPhotoUrl))
    setSavingEdit(false)
    if (ok) {
      cancelEdit()
      showToast(tx.requestUpdated)
    }
  }

  async function handleWithdraw(number: number) {
    if (!window.confirm(tx.withdrawThisRequest)) return
    const ok = await withdraw(number)
    if (ok) showToast(tx.requestWithdrawn)
  }

  async function handleDeny(number: number) {
    if (!denyReason.trim()) return
    const ok = await deny(number, denyReason.trim())
    if (ok) {
      showToast(tx.requestDenied)
      setDenyingNumber(null)
      setDenyReason('')
    }
  }

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-2">
          {tx.featureRequests}
        </h1>
        <p className="text-sm text-cream/40 mb-6">
          {isOwner
            ? (tx.haveAnIdeaForSomethingThe2)
            : (tx.haveAnIdeaForSomethingThe)}
        </p>

        <form onSubmit={handleSubmit} className="card p-5 space-y-3 mb-8">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={tx.shortTitle}
            maxLength={120}
            required
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={tx.describeTheIdea}
            rows={4}
            maxLength={2000}
            required
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none"
          />
          {photoUrl && (
            <div className="relative w-24 h-24">
              <SkeletonImage
                src={resizedImage(photoUrl, 160)}
                alt=""
                className="w-full h-full object-cover rounded-lg"
              />
              <button type="button"
                onClick={() => setPhotoUrl(null)}
                aria-label={tx.removePhoto}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] hover:bg-black/80"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 text-cream/40 hover:text-cream/70 cursor-pointer transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {photoUploading
                ? (tx.uploading)
                : photoUrl
                  ? (tx.replacePhoto)
                  : (tx.addPhoto)}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                disabled={photoUploading}
                className="hidden"
              />
            </label>
            <button type="submit"
              disabled={submitting || !title.trim() || !description.trim() || photoUploading}
              className="btn-primary disabled:opacity-50"
            >
              {submitting
                ? (tx.submitting)
                : (tx.submitRequest)}
            </button>
          </div>
        </form>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : requests.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {tx.noRequestsYet}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-end gap-2 mb-3">
              <span className="text-xs text-cream/40">{tx.sortBy}</span>
              <AppSelect
                value={sortMode}
                onValueChange={setSortMode}
                triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg px-2 py-1.5 text-xs text-cream/80 outline-none focus:border-amber/30"
                aria-label={tx.sortBy}
                options={[
                  { value: 'status', label: tx.sortByStatus },
                  { value: 'recent', label: tx.sortByMostRecent },
                ]}
              />
            </div>
            <div className="space-y-3">
            {sortedRequests.map(r => {
              const status = getStatus(r.labels, r.state)
              const statusLabel: Record<RequestStatus, string> = {
                pending: tx.pending,
                approved: tx.approved,
                denied: tx.denied,
                'in-progress': tx.claudeIsWorkingOnIt,
                'needs-input': tx.needsYourInput,
                'pr-open': tx.pROpenForReview,
                closed: tx.closed,
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
              const { text: bodyText, imageUrl: bodyImageUrl } = extractFeatureRequestImage(r.body.split('\n---\n')[0])
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
                      {editPhotoUrl && (
                        <div className="relative w-24 h-24">
                          <SkeletonImage
                            src={resizedImage(editPhotoUrl, 160)}
                            alt=""
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <button type="button"
                            onClick={() => setEditPhotoUrl(null)}
                            aria-label={tx.removePhoto}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] hover:bg-black/80"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 text-cream/40 hover:text-cream/70 cursor-pointer transition-colors">
                          {editPhotoUploading
                            ? (tx.uploading)
                            : editPhotoUrl
                              ? (tx.replacePhoto)
                              : (tx.addPhoto)}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={e => handleEditPhotoSelect(r.number, e)}
                            disabled={editPhotoUploading}
                            className="hidden"
                          />
                        </label>
                        <button type="button"
                          onClick={() => handleSaveEdit(r.number)}
                          disabled={savingEdit || !editTitle.trim() || !editDescription.trim() || editPhotoUploading}
                          className="btn-primary disabled:opacity-50 text-xs px-3 py-1.5"
                        >
                          {savingEdit
                            ? (tx.saving)
                            : (tx.save)}
                        </button>
                        <button type="button"
                          onClick={cancelEdit}
                          className="text-xs text-cream/40 hover:text-cream/70 transition-colors"
                        >
                          {tx.cancel}
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
                        {bodyText}
                      </p>
                      {bodyImageUrl && (
                        <a href={bodyImageUrl} target="_blank" rel="noreferrer" className="block w-24 h-24 mb-2">
                          <SkeletonImage
                            src={resizedImage(bodyImageUrl, 160)}
                            alt=""
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </a>
                      )}
                      {status === 'denied' && r.denialReason && (
                        <p className="text-sm text-red-400/80 whitespace-pre-wrap mb-2">
                          {tx.denialReason}{r.denialReason}
                        </p>
                      )}
                      {denyingNumber === r.number ? (
                        <div className="space-y-2">
                          <textarea
                            value={denyReason}
                            onChange={e => setDenyReason(e.target.value)}
                            placeholder={tx.whyIsThisBeingDenied}
                            rows={2}
                            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
                          />
                          <div className="flex gap-2">
                            <button type="button"
                              disabled={!denyReason.trim()}
                              onClick={() => handleDeny(r.number)}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                            >
                              {tx.sendDenial}
                            </button>
                            <button type="button" onClick={() => { setDenyingNumber(null); setDenyReason('') }} className="text-xs text-cream/40 hover:text-cream/70 transition-colors">
                              {tx.cancel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                          <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="text-xs text-cream/30 hover:text-cream/60 transition-colors">
                            {tx.viewOnGitHub} #{r.number}
                          </a>
                          {isOwner && canApprove && (
                            <button type="button"
                              onClick={() => handleApprove(r.number)}
                              className="text-xs font-semibold text-amber hover:text-amber/80 transition-colors"
                            >
                              {status === 'needs-input'
                                ? (tx.retry)
                                : (tx.approveForClaude)}
                            </button>
                          )}
                          {isOwner && status === 'approved' && (
                            <button type="button"
                              onClick={() => handleUnapprove(r.number)}
                              className="text-xs font-semibold text-cream/50 hover:text-cream/80 transition-colors"
                            >
                              {tx.unapprove}
                            </button>
                          )}
                          {isOwner && canDeny && (
                            <button type="button"
                              onClick={() => { setDenyingNumber(r.number); setDenyReason('') }}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                            >
                              {tx.deny}
                            </button>
                          )}
                          {canEdit && (
                            <button type="button"
                              onClick={() => startEdit(r)}
                              className="text-xs font-semibold text-cream/50 hover:text-cream/80 transition-colors"
                            >
                              {tx.edit}
                            </button>
                          )}
                          {canEdit && (
                            <button type="button"
                              onClick={() => handleWithdraw(r.number)}
                              className="text-xs font-semibold text-red-400/70 hover:text-red-400 transition-colors"
                            >
                              {tx.withdraw}
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
          </>
        )}
      </div>
    </div>
  )
}
