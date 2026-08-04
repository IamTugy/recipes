import { Toast } from '@base-ui/react/toast'

export type ToastType = 'success' | 'error'

export const TOAST_DURATION_MS = 3000

/**
 * Global toast manager so `showToast` can be called from anywhere in the app
 * (event handlers, effects, etc.), not just from inside a component that
 * renders `Toast.Root`. `ToastProvider` wires this instance into
 * `Toast.Provider` via the `toastManager` prop.
 */
export const toastManager = Toast.createToastManager<{ type: ToastType }>()
