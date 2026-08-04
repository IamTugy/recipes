import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'

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
  return (
    <Modal open={open} onOpenChange={next => { if (!next) onCancel() }} zIndexClassName="z-[80]" panelClassName="max-w-sm p-6 space-y-4">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">{title}</Dialog.Title>
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
    </Modal>
  )
}
