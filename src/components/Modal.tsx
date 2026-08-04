import type { ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  panelClassName?: string
  zIndexClassName?: string
  children: ReactNode
}

export default function Modal({ open, onOpenChange, panelClassName, zIndexClassName = 'z-50', children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 ${zIndexClassName}`}
        />
        <Dialog.Viewport className={`fixed inset-0 flex items-center justify-center p-4 ${zIndexClassName}`}>
          <Dialog.Popup
            className={`pointer-events-auto card w-full transition-all duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 ${panelClassName ?? 'max-w-sm p-6'}`}
          >
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
