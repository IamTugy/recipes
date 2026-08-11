import { Toast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toastManager, TOAST_DURATION_MS } from './toastContextObject'

function ToastList() {
  const { toasts, close } = Toast.useToastManager()
  const navigate = useNavigate()

  return toasts.map(toast => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      onClick={() => {
        if (toast.data?.href) navigate(toast.data.href)
        close(toast.id)
      }}
      className={`pointer-events-auto max-w-sm px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg cursor-pointer border transition-all duration-200 data-[starting-style]:opacity-0 data-[starting-style]:translate-y-3 data-[ending-style]:opacity-0 data-[ending-style]:translate-y-3 ${
        toast.type === 'error'
          ? 'bg-red-500/10 border-red-500/30 text-red-400'
          : toast.type === 'info'
            ? 'bg-amber/10 border-amber/30 text-amber'
            : 'bg-herb/10 border-herb/30 text-herb'
      }`}
    >
      <Toast.Description>{toast.description}</Toast.Description>
    </Toast.Root>
  ))
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={TOAST_DURATION_MS}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="print:hidden fixed bottom-4 inset-x-0 z-[80] flex flex-col items-center gap-2 pointer-events-none px-4">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
