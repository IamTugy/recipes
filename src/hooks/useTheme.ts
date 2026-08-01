import { useContext } from 'react'
import { ThemeContext } from '../context/themeContextObject'

export function useTheme() {
  return useContext(ThemeContext)
}
