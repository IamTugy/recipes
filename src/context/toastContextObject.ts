import { Toast } from '@base-ui/react/toast'

export type ToastType = 'success' | 'error' | 'info'

export const TOAST_DURATION_MS = 3000

// Extra per-toast data (base-ui's generic Data slot, distinct from the
// built-in `type`/`description`/`timeout` fields) - href lets a toast be
// clickable to navigate somewhere, used by the job-progress toasts to link
// to the finished recipe once a job completes.
export interface ToastData {
  href?: string
}

/**
 * Global toast manager so `showToast` can be called from anywhere in the app
 * (event handlers, effects, etc.), not just from inside a component that
 * renders `Toast.Root`. `ToastProvider` wires this instance into
 * `Toast.Provider` via the `toastManager` prop.
 */
export const toastManager = Toast.createToastManager<ToastData>()
