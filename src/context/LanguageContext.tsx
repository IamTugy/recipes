import { useState, useEffect, type ReactNode } from 'react'
import type { Lang } from '../types'
import { LanguageContext } from './languageContextObject'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('lang')
    return (saved === 'en' || saved === 'he') ? saved : 'he'
  })

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('lang', l)
  }

  useEffect(() => {
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, isHe: lang === 'he' }}>
      {children}
    </LanguageContext.Provider>
  )
}
