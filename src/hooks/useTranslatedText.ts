import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { useLanguage } from './useLanguage'
import { translateText } from '../lib/translate'

// Module-level, not per-component-instance - the same untranslated string
// (a recipe's Hebrew-only ingredient name, say) can appear in many cards on
// one page, and the same recipe reappears across page loads for the same
// session. One in-memory cache means only the very first render of a given
// (text, targetLang) pair ever calls the API - every other render, on this
// page or any other, is a synchronous Map read. The API itself also caches
// server-side (Redis, 30 days), so this is purely about skipping the
// network round-trip entirely for anything already seen this session.
const cache = new Map<string, string>()

// Most translatable fields in this app come as a pair: a required field in
// one language (usually Hebrew) and an optional counterpart (usually
// English) that may not have been filled in - AI-imported or older content
// especially. Rather than falling back to showing the untranslated field
// (mixing languages on screen), this calls the translation API once for
// that missing counterpart and caches the result.
//
// `primary` is whatever's already in the language currently being
// displayed - if it's present, it's returned as-is, no network call, no
// loading state. `secondary` is the other language's field - only used as
// translation input when `primary` is empty.
export function useTranslatedText(primary: string | undefined, secondary: string | undefined): { text: string; loading: boolean } {
  const { lang } = useLanguage()
  const { getToken } = useAuth()
  const trimmedPrimary = primary?.trim() ?? ''
  const trimmedSecondary = secondary?.trim() ?? ''
  const needsTranslation = !trimmedPrimary && !!trimmedSecondary
  const cacheKey = needsTranslation ? `${lang}:${trimmedSecondary}` : null

  const [translated, setTranslated] = useState<string | null>(cacheKey ? cache.get(cacheKey) ?? null : null)

  useEffect(() => {
    if (!cacheKey) return
    const cached = cache.get(cacheKey)
    if (cached) {
      setTranslated(cached)
      return
    }
    let cancelled = false
    setTranslated(null)
    translateText(trimmedSecondary, lang, getToken).then(result => {
      if (cancelled) return
      // A failed/empty translation still needs to resolve to *something* -
      // falling back to the untranslated source here is a last resort, not
      // the normal path (that only happens on an actual API failure).
      const value = result || trimmedSecondary
      cache.set(cacheKey, value)
      setTranslated(value)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  if (trimmedPrimary) return { text: trimmedPrimary, loading: false }
  if (!needsTranslation) return { text: '', loading: false }
  return { text: translated ?? '', loading: translated === null }
}
