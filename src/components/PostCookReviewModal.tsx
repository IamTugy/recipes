import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'
import { t } from '../i18n'

interface PostCookReviewModalProps {
  open: boolean
  lang: 'he' | 'en'
  userRating: number | null
  hoverRating: number | null
  onHoverRating: (n: number | null) => void
  onRate: (n: number) => void
  reviewComment: string
  onCommentChange: (value: string) => void
  reviewPhotoUrl: string | null
  reviewPhotoUploading: boolean
  onPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemovePhoto: () => void
  onSubmit: () => void
  onDismiss: () => void
}

export default function PostCookReviewModal({
  open, lang, userRating, hoverRating, onHoverRating, onRate,
  reviewComment, onCommentChange, reviewPhotoUrl, reviewPhotoUploading,
  onPhotoSelect, onRemovePhoto, onSubmit, onDismiss,
}: PostCookReviewModalProps) {
  const tx = t[lang]
  return (
    <Modal open={open} onOpenChange={next => { if (!next) onDismiss() }} zIndexClassName="z-[80]" panelClassName="max-w-sm p-6 space-y-4">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">{tx.howWasIt}</Dialog.Title>
      <p className="text-sm text-cream/60">{tx.tellUsAboutYourCook}</p>
      <div className="flex items-center gap-1.5" onMouseLeave={() => onHoverRating(null)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            type="button"
            key={n}
            onClick={() => onRate(n)}
            onMouseEnter={() => onHoverRating(n)}
            aria-label={`${n} ★`}
            className="text-2xl leading-none p-1"
          >
            <span className={n <= (hoverRating ?? userRating ?? 0) ? 'text-amber' : 'text-cream/20'}>★</span>
          </button>
        ))}
      </div>
      <textarea
        value={reviewComment}
        onChange={e => onCommentChange(e.target.value)}
        placeholder={userRating ? undefined : ' '}
        rows={2}
        maxLength={500}
        disabled={!userRating}
        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-3 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none disabled:opacity-50"
        dir={lang === 'he' ? 'rtl' : 'ltr'}
      />
      {reviewPhotoUrl && (
        <div className="relative w-24 h-24">
          <img src={reviewPhotoUrl} alt="" className="w-full h-full object-cover rounded-lg" />
          <button type="button"
            onClick={onRemovePhoto}
            aria-label="✕"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] hover:bg-black/80"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 transition-colors ${
          userRating ? 'text-cream/40 hover:text-cream/70 cursor-pointer' : 'text-cream/20 cursor-not-allowed'
        }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {reviewPhotoUploading ? '...' : reviewPhotoUrl ? '↻' : '+'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPhotoSelect}
            disabled={!userRating || reviewPhotoUploading}
            className="hidden"
          />
        </label>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDismiss} className="btn-ghost">
          {tx.maybeLater}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!userRating || !reviewComment.trim() || reviewPhotoUploading}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {tx.postReview}
        </button>
      </div>
    </Modal>
  )
}
