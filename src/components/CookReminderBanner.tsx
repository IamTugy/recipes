import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { getCookReminders } from '../lib/cookSessions'
import { toastManager } from '../context/toastContextObject'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'

const DISMISSED_KEY_PREFIX = 'cook-reminder-shown-'

function wasAlreadyShown(recipeId: string): boolean {
  try {
    return localStorage.getItem(`${DISMISSED_KEY_PREFIX}${recipeId}`) === '1'
  } catch {
    return false
  }
}

function markShown(recipeId: string): void {
  try {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${recipeId}`, '1')
  } catch {
    // localStorage unavailable - the reminder just shows again next load, harmless
  }
}

// Global, mounted once outside the page-routed tree (see main.tsx), same
// pattern as JobsWatcher - checks once per app load (not a recurring poll)
// whether the user has any finished-but-unreviewed cook older than 24h,
// and surfaces a one-time dismissible toast for the first one found. Local
// per-recipe dismissal (not synced across devices) since the underlying
// condition - an actual posted review - is what permanently clears it
// either way.
export default function CookReminderBanner() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { lang } = useLanguage()
  const tx = t[lang]
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || checkedRef.current) return
    checkedRef.current = true

    getCookReminders(getToken).then(reminders => {
      const unshown = reminders.find(r => !wasAlreadyShown(r.recipeId))
      if (!unshown) return
      markShown(unshown.recipeId)
      toastManager.add({
        description: tx.reminderToReview(unshown.recipeTitle),
        type: 'info',
        timeout: 10000,
        data: { href: `/recipes/${unshown.recipeId}` },
      })
    })
  }, [isLoaded, isSignedIn, getToken, tx])

  return null
}
