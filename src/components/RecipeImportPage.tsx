import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { importRecipe } from '../lib/recipeImport'

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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uploadSlugRef = useRef(`import-${Date.now()}`)

  const trimmedSource = source.trim()
  const sourceCount = [trimmedSource, file].filter(Boolean).length
  const canSubmit = sourceCount === 1 && !loading

  async function handlePhotoSelected(selected: File | undefined | null) {
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError(lang === 'he' ? 'יש להעלות קובץ JPEG, PNG או WEBP' : 'Please upload a JPEG, PNG, or WEBP file')
      return
    }
    setPhotoUploading(true)
    setError(null)
    try {
      const token = await getToken()
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ recipeSlug: uploadSlugRef.current, contentType: selected.type, purpose: 'recipe' }),
      })
      if (!presignRes.ok) throw new Error('presign failed')
      const { uploadUrl, publicUrl } = await presignRes.json()
      const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': selected.type }, body: selected })
      if (!uploadResult.ok) throw new Error('upload failed')
      setPhotoUrl(publicUrl)
    } catch {
      setError(lang === 'he' ? 'העלאת התמונה נכשלה' : 'Photo upload failed')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleExtract() {
    setError(null)
    setLoading(true)
    try {
      const draft = await importRecipe(
        isUrl(trimmedSource) ? { url: trimmedSource } : { text: trimmedSource || undefined, file: file ?? undefined },
        getToken
      )
      if (photoUrl) draft.image = photoUrl
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
            <label className={labelClass}>{lang === 'he' ? 'טקסט או קישור' : 'Text or link'}</label>
            <textarea
              value={source}
              onChange={e => setSource(e.target.value)}
              disabled={!!file}
              rows={6}
              className={inputClass}
              placeholder={lang === 'he' ? 'הדביקו כאן טקסט מתכון, או קישור לאתר...' : 'Paste recipe text, or a website URL...'}
            />
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'קובץ PDF או DOCX' : 'PDF or DOCX file'}</label>
            <label
              onDragOver={e => { e.preventDefault(); if (!trimmedSource) setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDragging(false)
                if (trimmedSource) return
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) setFile(dropped)
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors cursor-pointer ${
                trimmedSource
                  ? 'border-tint/10 text-cream/20 cursor-not-allowed'
                  : isDragging
                    ? 'border-amber/50 bg-amber/[0.06] text-cream/70'
                    : 'border-tint/15 text-cream/40 hover:border-amber/30 hover:text-cream/60'
              }`}
            >
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                disabled={!!trimmedSource}
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

          <div>
            <label className={labelClass}>{lang === 'he' ? 'תמונת מתכון (אופציונלי)' : 'Recipe photo (optional)'}</label>
            <label className="flex items-center gap-3 rounded-lg border border-tint/10 bg-tint/[0.03] px-3 py-2 cursor-pointer hover:border-amber/30 transition-colors">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => { handlePhotoSelected(e.target.files?.[0]); e.target.value = '' }}
                disabled={photoUploading}
                className="hidden"
              />
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-10 h-10 rounded object-cover" />
              ) : (
                <span className="w-10 h-10 rounded bg-tint/10 flex items-center justify-center text-cream/25 text-lg">📷</span>
              )}
              <span className="text-sm text-cream/60">
                {photoUploading
                  ? (lang === 'he' ? 'מעלה...' : 'Uploading...')
                  : photoUrl
                    ? (lang === 'he' ? 'לחצו להחלפת התמונה' : 'Click to replace photo')
                    : (lang === 'he' ? 'בחרו תמונה' : 'Choose a photo')}
              </span>
            </label>
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
