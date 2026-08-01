import { createContext } from 'react'

export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

export interface ThemeContextValue {
  theme: Theme
  mode: ThemeMode
  cycleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  mode: 'system',
  cycleTheme: () => {},
})
