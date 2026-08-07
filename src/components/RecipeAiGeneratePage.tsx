import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { generateRecipeWithAi } from '../lib/recipeAiGenerate'

export default function RecipeAiGeneratePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const [query, setQuery] = useState((location.state as { query?: string } | null)?.query ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    const trimmed = query.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      const draft = await generateRecipeWithAi(trimmed, getToken)
      navigate('/recipes/new', { state: { importedDraft: draft } })
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'he' ? 'החיפוש נכשל' : 'Generation failed'))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors'

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-serif text-2xl font-bold text-cream">
          {lang === 'he' ? '🔮 חיפוש מתכון עם AI' : '🔮 Research a recipe with AI'}
        </h1>
        <p className="text-sm text-cream/50">
          {lang === 'he'
            ? 'ה-AI יחפש ברשת את המתכון הכי טוב (או שילוב של כמה מתכונים דומים) עבור מה שתבקשו, וימלא אותו בעורך. תוכלו לערוך הכל לפני השמירה - חוץ מתגית ה-AI והמקורות.'
            : 'The AI will search the web for the best existing recipe (or combination of similar recipes) for what you ask, and fill it into the editor. You can edit everything before saving - except the AI tag and sources.'}
        </p>

        {error && <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>}

        <div className="card p-5 space-y-3">
          <label className="block text-xs font-semibold text-cream/50">
            {lang === 'he' ? 'איזה מתכון תרצו?' : 'What recipe do you want?'}
          </label>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder={lang === 'he' ? 'למשל: הפוקאצ׳ה האיטלקית הכי טובה, טבעונית' : 'e.g. the best authentic Italian focaccia, vegan'}
          />
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void handleGenerate()} disabled={!query.trim() || loading} className="btn-primary disabled:opacity-50 flex items-center gap-2">
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? (lang === 'he' ? 'ה-AI חוקר את הרשת...' : 'AI is researching the web...') : (lang === 'he' ? 'חפש מתכון' : 'Research recipe')}
          </button>
          <button type="button" onClick={() => navigate('/recipes/new/blank')} disabled={loading} className="btn-ghost disabled:opacity-50">
            {lang === 'he' ? 'התחל מדף ריק' : 'Start from scratch instead'}
          </button>
        </div>
      </div>
    </div>
  )
}
