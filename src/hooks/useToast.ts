import { useContext } from 'react'
import { ToastContext } from '../context/toastContextObject'

export function useToast() {
  return useContext(ToastContext)
}
