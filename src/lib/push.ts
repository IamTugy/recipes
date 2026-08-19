import { apiFetch } from './api'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

// Requests Notification permission (only if not already decided) and
// registers a push subscription if granted - called from useTimers.ts's
// addTimer() so ANY timer (cook-mode or standalone) can alert while the
// app is backgrounded. Never throws - denied/unsupported/network failure
// all just mean "no background push," never a broken timer.
export async function ensurePushSubscription(getToken: () => Promise<string | null>): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
    }
    if (Notification.permission !== 'granted') return

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      const { publicKey } = await apiFetch<{ publicKey: string }>('/push/vapid-public-key', getToken)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    const token = await getToken()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(subscription.toJSON()),
    })
  } catch {
    // Any failure here (permission API missing, subscribe rejected, network
    // error) just means no background push - never blocks or breaks the
    // timer that triggered this call.
  }
}

export async function syncTimerStart(
  getToken: () => Promise<string | null>,
  clientId: string,
  recipeId: string,
  label: string,
  endsAt: number,
): Promise<void> {
  try {
    const token = await getToken()
    await fetch('/api/timers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clientId, recipeId, label, endsAt }),
    })
  } catch {
    // Fire-and-forget - a failed sync just means no background push for
    // this specific timer, the local countdown/sound is unaffected.
  }
}

export async function syncTimerRemoved(getToken: () => Promise<string | null>, clientId: string): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/timers/${clientId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // Fire-and-forget - worst case a stale row lingers until the next
    // successful sync overwrites or removes it.
  }
}
