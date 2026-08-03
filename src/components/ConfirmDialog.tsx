interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="card p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-serif text-lg font-bold text-cream">{title}</h2>
        <p className="text-sm text-cream/60">{message}</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost disabled:opacity-50">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`btn-primary disabled:opacity-50 ${danger ? '!bg-red-500/90 hover:!bg-red-500' : ''}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
