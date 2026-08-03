import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { importRecipe } from '../lib/recipeImport'

export default function RecipeImportPage() {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceCount = [text.trim(), url.trim(), file].filter(Boolean).length
  const canSubmit = sourceCount === 1 && !loading

  async function handleExtract() {
    setError(null)
    setLoading(true)
    try {
      const draft = await importRecipe(
        { text: text.trim() || undefined, url: url.trim() || undefined, file: file ?? undefined },
        getToken
      )
      navigate('/recipes/new', { state: { importedDraft: draft } })
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'he' ? 'הייבוא נכשל' : 'Import failed'))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors'
  const labelClass = 'block text-xs font-semibold text-cream/50 mb-1'

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-serif text-2xl font-bold text-cream">
          {lang === 'he' ? 'ייבוא מתכון עם AI' : 'Import Recipe with AI'}
        </h1>
        <p className="text-sm text-cream/50">
          {lang === 'he'
            ? 'הדביקו טקסט, קישור לאתר, או העלו קובץ PDF/DOCX - בחרו מקור אחד בלבד.'
            : 'Paste text, a website link, or upload a PDF/DOCX file - choose exactly one source.'}
        </p>

        {error && <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>}

        <div className="card p-5 space-y-4">
          <div>
            <label className={labelClass}>{lang === 'he' ? 'טקסט המתכון' : 'Recipe text'}</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={!!url.trim() || !!file}
              rows={6}
              className={inputClass}
              placeholder={lang === 'he' ? 'הדביקו כאן את תוכן המתכון...' : 'Paste the recipe content here...'}
            />
          </div>
          <div>
            <label className={labelClass}>{lang === 'he' ? 'קישור לאתר' : 'Website URL'}</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={!!text.trim() || !!file}
              className={inputClass}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={labelClass}>{lang === 'he' ? 'קובץ PDF או DOCX' : 'PDF or DOCX file'}</label>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              disabled={!!text.trim() || !!url.trim()}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={handleExtract} disabled={!canSubmit} className="btn-primary disabled:opacity-50">
            {loading ? (lang === 'he' ? 'מייבא...' : 'Extracting...') : (lang === 'he' ? 'ייבא' : 'Extract')}
          </button>
          <button type="button" onClick={() => navigate('/recipes/new/blank')} className="btn-ghost">
            {lang === 'he' ? 'התחל מדף ריק' : 'Start from scratch instead'}
          </button>
        </div>
      </div>
    </div>
  )
}
