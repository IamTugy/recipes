import { useEffect, useState } from 'react'
import { translateText } from '../lib/translate'
import type { QualityReview } from '../types'

// The AI quality review always responds in English (the review prompt is
// English) - translate its findings to Hebrew on the fly when that's the
// active UI language, same "never persisted, just shown" approach as
// useTranslatedRecipe. No-op when lang is 'en', since that's already the
// review's native language.
export function useTranslatedReview(
  review: QualityReview | null,
  lang: 'he' | 'en',
  getToken: () => Promise<string | null>
): QualityReview | null {
  const [translated, setTranslated] = useState<QualityReview | null>(review)
  const signature = review ? JSON.stringify(review.findings) : ''

  useEffect(() => {
    setTranslated(review)
    if (!review || lang !== 'he' || review.findings.length === 0) return
    let cancelled = false

    async function run() {
      const findings = await Promise.all(review!.findings.map(async f => ({
        ...f,
        message: (await translateText(f.message, 'he', getToken)) || f.message,
      })))
      if (!cancelled) setTranslated({ ...review!, findings })
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, lang])

  return translated
}
