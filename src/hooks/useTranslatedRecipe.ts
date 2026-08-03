import { useEffect, useState } from 'react'
import { translateText } from '../lib/translate'
import type { Recipe } from '../types'

// If a recipe was only ever written in one language, fill in the other
// language on the fly for display - never persisted, just shown. Runs
// once per distinct recipe content; falls back to the untranslated
// recipe immediately and swaps in translated text once ready.
export function useTranslatedRecipe(recipe: Recipe, getToken: () => Promise<string | null>): Recipe {
  const [translated, setTranslated] = useState<Recipe>(recipe)
  const signature = JSON.stringify(recipe)

  useEffect(() => {
    let cancelled = false
    setTranslated(recipe)

    async function run() {
      const clone: Recipe = JSON.parse(JSON.stringify(recipe))
      const jobs: Promise<void>[] = []

      function job(source: string | undefined, targetLang: 'he' | 'en', apply: (translated: string) => void) {
        if (!source?.trim()) return
        jobs.push(translateText(source, targetLang, getToken).then(v => { if (v) apply(v) }))
      }

      if (!clone.titleHe?.trim()) job(clone.title, 'he', v => { clone.titleHe = v })
      else if (!clone.title?.trim()) job(clone.titleHe, 'en', v => { clone.title = v })

      if (!clone.descriptionEn?.trim()) job(clone.description, 'en', v => { clone.descriptionEn = v })
      else if (!clone.description?.trim()) job(clone.descriptionEn, 'he', v => { clone.description = v })

      if ((clone.tagsEn?.length ?? 0) === 0 && clone.tags.length > 0) {
        clone.tagsEn = new Array(clone.tags.length).fill('')
        clone.tags.forEach((tag, i) => job(tag, 'en', v => { clone.tagsEn![i] = v }))
      }

      if ((clone.tips?.length ?? 0) === 0 && (clone.tipsEn?.length ?? 0) > 0) {
        clone.tips = new Array(clone.tipsEn!.length).fill('')
        clone.tipsEn!.forEach((tip, i) => job(tip, 'he', v => { clone.tips![i] = v }))
      } else if ((clone.tipsEn?.length ?? 0) === 0 && (clone.tips?.length ?? 0) > 0) {
        clone.tipsEn = new Array(clone.tips!.length).fill('')
        clone.tips!.forEach((tip, i) => job(tip, 'en', v => { clone.tipsEn![i] = v }))
      }

      clone.ingredients.forEach(group => {
        group.items.forEach(item => {
          if (!item.nameEn?.trim()) job(item.name, 'en', v => { item.nameEn = v })
        })
      })
      clone.steps.forEach(group => {
        group.items.forEach(item => {
          if (!item.instructionEn?.trim()) job(item.instruction, 'en', v => { item.instructionEn = v })
        })
      })

      await Promise.all(jobs)
      if (!cancelled) setTranslated(clone)
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  return translated
}
