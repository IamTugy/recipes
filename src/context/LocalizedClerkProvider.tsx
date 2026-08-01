import { ClerkProvider } from '@clerk/react'
import { heIL, enUS } from '@clerk/localizations'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const darkVariables = {
  colorBackground: 'rgb(17, 17, 19)',
  colorForeground: 'rgb(240, 240, 242)',
  colorText: 'rgb(240, 240, 242)',
  colorTextSecondary: 'rgb(240, 240, 242, 0.6)',
  colorPrimary: 'rgb(251, 191, 36)',
  colorInputBackground: 'rgb(255, 255, 255, 0.04)',
  colorInputText: 'rgb(240, 240, 242)',
  colorNeutral: 'rgb(240, 240, 242)',
}

export function LocalizedClerkProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage()
  const { theme } = useTheme()
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      localization={lang === 'he' ? heIL : enUS}
      appearance={theme === 'dark' ? { variables: darkVariables } : undefined}
    >
      {children}
    </ClerkProvider>
  )
}
