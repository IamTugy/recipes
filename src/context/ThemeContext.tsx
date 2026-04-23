import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'matcha' | 'ramen' | 'sakura'

const CYCLE: Theme[] = ['matcha', 'ramen', 'sakura']

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'matcha',
  setTheme: () => {},
  cycleTheme: () => {},
})

function readInitial(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'matcha' || saved === 'ramen' || saved === 'sakura') return saved
  if (saved === 'dark') return 'ramen'
  return 'matcha'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  const cycleTheme = () => setThemeState(t => CYCLE[(CYCLE.indexOf(t) + 1) % CYCLE.length])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
