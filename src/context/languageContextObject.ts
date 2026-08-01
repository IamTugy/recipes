import { createContext } from 'react'
import type { Lang } from '../types'

export interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  isHe: boolean
}

export const LanguageContext = createContext<LanguageContextValue>({
  lang: 'he',
  setLang: () => {},
  isHe: true,
})
