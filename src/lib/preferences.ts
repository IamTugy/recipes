import type { Lang } from '../types'
import type { ThemeMode } from '../context/themeContextObject'

export interface Preferences {
  lang?: Lang
  theme?: ThemeMode
}

export async function fetchPreferences(getToken: () => Promise<string | null>): Promise<Preferences> {
  const token = await getToken()
  const res = await fetch('/api/users/me/preferences', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return {}
  return res.json()
}

// Fire-and-forget from the caller's perspective - a failed sync just means
// the device-local choice (already applied and saved to localStorage) isn't
// mirrored to other devices yet, not something worth surfacing as an error.
export async function savePreferences(prefs: Preferences, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken()
  await fetch('/api/users/me/preferences', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(prefs),
  }).catch(() => undefined)
}
