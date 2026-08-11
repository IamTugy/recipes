import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { importRecipe, MAX_UPLOAD_BYTES } from '../lib/recipeImport'
import { ApiError } from '../lib/api'

const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))

const URL_PATTERN = /^https?:\/\/\S+$/i
const URL_IN_TEXT = /https?:\/\/\S+/i
const SOCIAL_HOST_PATTERN = /(^|\.)((www|m|vm|vt)\.)?(instagram\.com|facebook\.com|fb\.watch|tiktok\.com)$/i

function isUrl(value: string) {
  return URL_PATTERN.test(value.trim())
}

function isSocialUrl(value: string) {
  try {
    return SOCIAL_HOST_PATTERN.test(new URL(value).hostname)
  } catch {
    return false
  }
}

// Instagram/TikTok/Facebook share sheets typically hand over a caption with
// the link embedded inside it rather than a clean URL on its own - split
// those out so the link goes through URL import and the rest becomes the
// caption text sent alongside it. Non-social links are left as plain text
// import, since a URL mentioned inside pasted recipe text shouldn't be
// treated as an import source.
function splitSource(value: string): { url?: string; text?: string } {
  const trimmed = value.trim()
  if (isUrl(trimmed)) return { url: trimmed }
  const match = trimmed.match(URL_IN_TEXT)
  if (match && isSocialUrl(match[0])) {
    const caption = trimmed.replace(match[0], '').trim()
    return { url: match[0], text: caption || undefined }
  }
  return { text: trimmed || undefined }
}

export default function RecipeImportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const [source, setSource] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isDraggingDoc, setIsDraggingDoc] = useState(false)
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedSource = source.trim()
  const canSubmit = (!!trimmedSource || !!docFile || !!photoFile) && !loading

  function selectDocFile(selected: File | null) {
    if (selected && selected.size > MAX_UPLOAD_BYTES) {
      setError(lang === 'he' ? `הקובץ גדול מדי (מקסימום ${MAX_UPLOAD_MB}MB)` : `That file is too large (max ${MAX_UPLOAD_MB}MB)`)
      return
    }
    setError(null)
    setDocFile(selected)
    if (selected) setPhotoFile(null)
  }

  function selectPhotoFile(selected: File | null) {
    if (selected && selected.size > MAX_UPLOAD_BYTES) {
      setError(lang === 'he' ? `התמונה גדולה מדי (מקסימום ${MAX_UPLOAD_MB}MB)` : `That photo is too large (max ${MAX_UPLOAD_MB}MB)`)
      return
    }
    setError(null)
    setPhotoFile(selected)
    if (selected) setDocFile(null)
  }

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null)
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  async function handleExtract(overrideSource?: string) {
    const src = (overrideSource ?? trimmedSource)
    setError(null)
    setLoading(true)
    try {
      const { url, text } = splitSource(src)
      const result = await importRecipe(
        url ? { url, text } : { text: text || undefined, file: docFile ?? undefined, image: photoFile ?? undefined },
        getToken
      )
      if (Array.isArray(result)) {
        showToast(
          lang === 'he' ? `נמצאו ${result.length} מתכונים - נשמרו כטיוטות לבדיקה` : `Found ${result.length} recipes - saved as drafts for review`,
          'success'
        )
        navigate(`/recipes/${result[0].id}/edit`)
      } else {
        navigate('/recipes/new', { state: { importedDraft: result } })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setError(lang === 'he' ? 'החיבור נכשל - בדקו את האינטרנט ונסו שוב (או שהקובץ גדול מדי)' : 'Connection failed - check your internet and try again (or the file may be too large)')
      } else if (err instanceof ApiError && err.status === 413) {
        setError(lang === 'he' ? `הקובץ גדול מדי (מקסימום ${MAX_UPLOAD_MB}MB)` : `That file is too large (max ${MAX_UPLOAD_MB}MB)`)
      } else {
        setError(err instanceof Error ? err.message : (lang === 'he' ? 'הייבוא נכשל' : 'Import failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  // Handles both the PWA share-target redirect (share_target in
  // manifest.webmanifest) and the bookmarklet on NewRecipePage. Both land here
  // with ?url= and/or ?text= query params - Instagram/TikTok/Facebook share
  // sheets commonly fill only ?text= with a caption that has the link embedded
  // in it, so both params are combined and handed to splitSource above rather
  // than picking just one.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlParam = params.get('url')?.trim()
    const textParam = params.get('text')?.trim()
    const incoming = urlParam && textParam && !textParam.includes(urlParam)
      ? `${textParam} ${urlParam}`
      : textParam || urlParam
    if (!incoming) return
    setSource(incoming)
    navigate(location.pathname, { replace: true })
    void handleExtract(incoming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            ? 'הדביקו טקסט, קישור לאתר, או שתפו פוסט מאינסטגרם/פייסבוק/טיקטוק (הכיתוב שמצורף לשיתוף עוזר ל-AI למצוא את המתכון). ניתן גם להעלות קובץ PDF/DOCX או תמונה של המתכון (קישור לא ניתן לשילוב עם קובץ או תמונה).'
            : 'Paste recipe text, a website link, or share a post from Instagram/Facebook/TikTok (the caption that comes along helps the AI find the recipe). You can also upload a PDF/DOCX file or a photo of the recipe (a link can\'t be combined with a file or photo).'}
        </p>

        {error && <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>}

        <div className="card p-5 space-y-4">
          <div>
            <label className={labelClass}>{lang === 'he' ? 'טקסט או קישור' : 'Text or link'}</label>
            <textarea
              value={source}
              onChange={e => { setSource(e.target.value); if (isUrl(e.target.value)) { setDocFile(null); setPhotoFile(null) } }}
              rows={6}
              className={inputClass}
              placeholder={lang === 'he' ? 'הדביקו כאן טקסט מתכון, או קישור לאתר...' : 'Paste recipe text, or a website URL...'}
            />
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'קובץ PDF או DOCX' : 'PDF or DOCX file'}</label>
            <label
              onDragEnter={e => { e.preventDefault(); setIsDraggingDoc(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setIsDraggingDoc(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDraggingDoc(false)
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) selectDocFile(dropped)
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors cursor-pointer ${
                isDraggingDoc
                  ? 'border-amber/50 bg-amber/[0.06] text-cream/70'
                  : 'border-tint/15 text-cream/40 hover:border-amber/30 hover:text-cream/60'
              }`}
            >
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => selectDocFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {docFile ? (
                <span className="text-cream/70">{docFile.name}</span>
              ) : (
                <>
                  <span>{lang === 'he' ? 'גררו קובץ לכאן, או לחצו לבחירה' : 'Drag a file here, or click to browse'}</span>
                  <span className="text-xs text-cream/25">PDF / DOCX</span>
                </>
              )}
            </label>
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'תמונה של המתכון' : 'Photo of the recipe'}</label>
            <label
              onDragEnter={e => { e.preventDefault(); setIsDraggingPhoto(true) }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setIsDraggingPhoto(false)}
              onDrop={e => {
                e.preventDefault()
                setIsDraggingPhoto(false)
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) selectPhotoFile(dropped)
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors cursor-pointer overflow-hidden ${
                isDraggingPhoto
                  ? 'border-amber/50 bg-amber/[0.06] text-cream/70'
                  : 'border-tint/15 text-cream/40 hover:border-amber/30 hover:text-cream/60'
              }`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => selectPhotoFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {photoFile && photoPreview ? (
                <div className="flex items-center gap-3">
                  <img src={photoPreview} alt="" className="w-16 h-16 object-cover rounded-md" />
                  <span className="text-cream/70">{photoFile.name}</span>
                </div>
              ) : (
                <>
                  <span>{lang === 'he' ? 'גררו תמונה לכאן, או לחצו לבחירה' : 'Drag a photo here, or click to browse'}</span>
                  <span className="text-xs text-cream/25">{lang === 'he' ? 'צילום עמוד מתכון, ספר בישול או פתק' : 'A photo of a cookbook page, printout, or handwritten card'}</span>
                </>
              )}
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void handleExtract()} disabled={!canSubmit} className="btn-primary disabled:opacity-50 flex items-center gap-2">
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {loading ? (lang === 'he' ? 'ה-AI מנתח את המתכון...' : 'AI is reading the recipe...') : (lang === 'he' ? 'העלה' : 'Upload')}
          </button>
        </div>
      </div>
    </div>
  )
}
