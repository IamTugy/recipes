import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { importRecipe } from '../lib/recipeImport'
import PhotoUploadField from './PhotoUploadField'

const URL_PATTERN = /^https?:\/\/\S+$/i

function isUrl(value: string) {
  return URL_PATTERN.test(value.trim())
}

export default function RecipeImportPage() {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uploadSlugRef = useRef(`import-${Date.now()}`)

  const trimmedSource = source.trim()
  const canSubmit = (!!trimmedSource || !!file) && !loading

  function selectFile(selected: File | null) {
    setFile(selected)
    if (selected) setSource('')
  }

  async function handleExtract() {
    setError(null)
    setLoading(true)
    try {
      const draft = await importRecipe(
        isUrl(trimmedSource) ? { url: trimmedSource } : { text: trimmedSource || undefined, file: file ?? undefined },
        getToken
      )
      if (image) draft.image = image
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
            ? 'הדביקו טקסט או קישור לאתר, או העלו קובץ PDF/DOCX - בחרו מקור אחד. אפשר גם לצרף תמונה למתכון.'
            : 'Paste recipe text or a website link, or upload a PDF/DOCX file - choose one source. You can also attach a photo.'}
        </p>

        {error && <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>}

        <div className="card p-5 space-y-4">
          <div>
            <label className={labelClass}>{lang === 'he' ? 'תמונה' : 'Photo'}</label>
            <PhotoUploadField
              image={image}
              onChange={setImage}
              uploadSlug={uploadSlugRef.current}
              lang={lang}
              onError={setError}
            />
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'טקסט או קישור' : 'Text or link'}</label>
            <textarea
              value={source}
              onChange={e => { setSource(e.target.value); if (e.target.value.trim()) setFile(null) }}
              rows={6}
              className={inputClass}
              placeholder={lang === 'he' ? 'הדביקו כאן טקסט מתכון, או קישור לאתר...' : 'Paste recipe text, or a website URL...'}
            />
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'קובץ PDF או DOCX' : 'PDF or DOCX file'}</label>
            <label
              onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) selectFile(dropped)
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors cursor-pointer ${
                isDragging
                  ? 'border-amber/50 bg-amber/[0.06] text-cream/70'
                  : 'border-tint/15 text-cream/40 hover:border-amber/30 hover:text-cream/60'
              }`}
            >
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => selectFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {file ? (
                <span className="text-cream/70">{file.name}</span>
              ) : (
                <>
                  <span>{lang === 'he' ? 'גררו קובץ לכאן, או לחצו לבחירה' : 'Drag a file here, or click to browse'}</span>
                  <span className="text-xs text-cream/25">PDF / DOCX</span>
                </>
              )}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={handleExtract} disabled={!canSubmit} className="btn-primary disabled:opacity-50 flex items-center gap-2">
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? (lang === 'he' ? 'ה-AI מנתח את המתכון...' : 'AI is reading the recipe...') : (lang === 'he' ? 'ייבוא' : 'Import')}
          </button>
          <button type="button" onClick={() => navigate('/recipes/new/blank')} disabled={loading} className="btn-ghost disabled:opacity-50">
            {lang === 'he' ? 'התחל מדף ריק' : 'Start from scratch instead'}
          </button>
        </div>
      </div>
    </div>
  )
}
