import { useContext } from 'react'
import { LanguageContext } from '../context/languageContextObject'

export function useLanguage() {
  return useContext(LanguageContext)
}
