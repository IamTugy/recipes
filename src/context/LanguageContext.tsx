import { useState, useEffect, type ReactNode } from 'react'
import type { Lang } from '../types'
import { LanguageContext } from './languageContextObject'

// No saved preference yet - follow the browser/device language rather than
// defaulting to one fixed language for every visitor.
function getBrowserLang(): Lang {
  const languages = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  return languages.some(l => l.toLowerCase().startsWith('he')) ? 'he' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('lang')
    return (saved === 'en' || saved === 'he') ? saved : getBrowserLang()
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
