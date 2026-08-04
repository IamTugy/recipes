import { useCallback } from 'react'
import { toastManager, TOAST_DURATION_MS, type ToastType } from '../context/toastContextObject'

export function useToast() {
  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    toastManager.add({ description: message, type, timeout: TOAST_DURATION_MS })
  }, [])

  return { showToast }
}
