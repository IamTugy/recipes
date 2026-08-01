import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ToastContext, type Toast } from './toastContextObject'

let idCounter = 0
const TOAST_DURATION_MS = 3000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timeout = timeouts.current.get(id)
    if (timeout) {
      clearTimeout(timeout)
      timeouts.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = `toast-${idCounter++}`
    setToasts(prev => [...prev, { id, message, type }])
    timeouts.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION_MS))
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="print:hidden fixed bottom-4 inset-x-0 z-[80] flex flex-col items-center gap-2 pointer-events-none px-4">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              onClick={() => dismiss(toast.id)}
              className={`pointer-events-auto max-w-sm px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg cursor-pointer border ${
                toast.type === 'success'
                  ? 'bg-herb/10 border-herb/30 text-herb'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
