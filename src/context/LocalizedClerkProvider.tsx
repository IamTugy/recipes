import { ClerkProvider } from '@clerk/react'
import { heIL, enUS } from '@clerk/localizations'
import { useLanguage } from '../hooks/useLanguage'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

export function LocalizedClerkProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage()
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/" localization={lang === 'he' ? heIL : enUS}>
      {children}
    </ClerkProvider>
  )
}
