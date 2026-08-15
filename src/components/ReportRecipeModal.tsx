import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import Modal from './Modal'
import type { ReportReason } from '../types'
import { t } from '../i18n'

interface ReportRecipeModalProps {
  open: boolean
  lang: 'he' | 'en'
  submitting: boolean
  onSubmit: (reason: ReportReason, message: string) => void
  onCancel: () => void
}

const REASONS: ReportReason[] = ['inappropriate', 'incorrect', 'spam', 'copyright', 'other']

export default function ReportRecipeModal({ open, lang, submitting, onSubmit, onCancel }: ReportRecipeModalProps) {
  const tx = t[lang]
  const [reason, setReason] = useState<ReportReason>('inappropriate')
  const [message, setMessage] = useState('')

  return (
    <Modal
      open={open}
      onOpenChange={next => { if (!next) onCancel() }}
      zIndexClassName="z-[80]"
      panelClassName="max-w-sm p-6 space-y-4"
    >
      <Dialog.Title className="font-serif text-lg font-bold text-cream">{tx.reportRecipe}</Dialog.Title>
      <div className="space-y-2">
        {REASONS.map(r => (
          <label key={r} className="flex items-center gap-2 text-sm text-cream/80 cursor-pointer">
            <input
              type="radio"
              name="report-reason"
              checked={reason === r}
              onChange={() => setReason(r)}
              className="accent-amber"
            />
            {tx.reportReasons[r]}
          </label>
        ))}
      </div>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={tx.reportMessagePlaceholder}
        rows={3}
        className="input-field w-full resize-none"
      />
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={submitting} className="btn-ghost disabled:opacity-50">
          {tx.cancel}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(reason, message)}
          disabled={submitting}
          className="btn-primary disabled:opacity-50"
        >
          {submitting ? tx.submitting : tx.submitReport}
        </button>
      </div>
    </Modal>
  )
}
