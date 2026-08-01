import { createContext } from 'react'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

export interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void
}

export const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })
