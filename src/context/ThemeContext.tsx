import { useEffect, useState } from 'react'
import { ThemeContext, type Theme, type ThemeMode } from './themeContextObject'

function getSystemTheme(): Theme {
  const prefersDark = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('themeMode')
    return (saved === 'dark' || saved === 'light' || saved === 'system') ? saved : 'system'
  })
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme)

  const theme: Theme = mode === 'system' ? systemTheme : mode

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('themeMode', mode)
  }, [theme, mode])

  // While in "system" mode, follow live OS theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange(e: MediaQueryListEvent) {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  function cycleTheme() {
    setMode(m => m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ theme, mode, cycleTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
