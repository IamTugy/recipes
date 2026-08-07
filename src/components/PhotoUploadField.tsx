import { useState } from 'react'
import { useAuth } from '@clerk/react'
import ImageCropModal from './ImageCropModal'
import EnhanceImageModal from './EnhanceImageModal'

interface PhotoUploadFieldProps {
  image: string
  onChange: (url: string) => void
  uploadRecipeId: string
  lang: 'he' | 'en'
  onError?: (message: string) => void
}

export default function PhotoUploadField({ image, onChange, uploadRecipeId, lang, onError }: PhotoUploadFieldProps) {
  const { getToken } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  // Single-level undo for the last accepted AI enhance - cleared by any
  // other change (fresh upload, another enhance) so it never points at a
  // stale photo.
  const [preEnhanceImage, setPreEnhanceImage] = useState<string | null>(null)
  const busy = uploading

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onError?.(lang === 'he' ? 'סוג קובץ לא נתמך' : 'Unsupported file type')
      return
    }
    setCropSrc(URL.createObjectURL(file))
  }

  function closeCropModal() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  async function handleCropConfirm(blob: Blob) {
    closeCropModal()
    setUploading(true)
    try {
      const token = await getToken()
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipeId: uploadRecipeId, contentType: 'image/jpeg', purpose: 'recipe' }),
      })
      if (!presignRes.ok) throw new Error('presign failed')
      const { uploadUrl, publicUrl } = await presignRes.json()
      const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
      if (!uploadResult.ok) throw new Error('upload failed')
      setPreEnhanceImage(null)
      onChange(publicUrl)
    } catch {
      onError?.(lang === 'he' ? 'העלאת התמונה נכשלה' : 'Photo upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <label className="relative block w-full h-48 rounded-xl overflow-hidden border border-tint/10 bg-tint/[0.03] cursor-pointer group">
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelected} disabled={busy} className="hidden" />
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-cream/25">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">{lang === 'he' ? 'העלה תמונה' : 'Upload a photo'}</span>
          </div>
        )}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
          busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <span className="text-xs font-semibold text-white">
            {uploading
              ? (lang === 'he' ? 'מעלה...' : 'Uploading...')
              : image
                ? (lang === 'he' ? 'החלף תמונה' : 'Swap photo')
                : (lang === 'he' ? 'העלה תמונה' : 'Upload photo')}
          </span>
        </div>
      </label>
      {image && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEnhanceOpen(true)}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber hover:text-amber/80 disabled:opacity-40 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {lang === 'he' ? 'שפר תמונה עם AI' : 'Enhance photo with AI'}
          </button>
          {preEnhanceImage && (
            <button
              type="button"
              onClick={() => { onChange(preEnhanceImage); setPreEnhanceImage(null) }}
              className="flex items-center gap-1 text-xs font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              {lang === 'he' ? 'בטל שיפור' : 'Undo enhance'}
            </button>
          )}
        </div>
      )}
      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} lang={lang} onCancel={closeCropModal} onConfirm={handleCropConfirm} />
      )}
      {enhanceOpen && image && (
        <EnhanceImageModal
          imageUrl={image}
          uploadRecipeId={uploadRecipeId}
          lang={lang}
          onCancel={() => setEnhanceOpen(false)}
          onApplied={publicUrl => { setPreEnhanceImage(image); onChange(publicUrl); setEnhanceOpen(false) }}
        />
      )}
    </>
  )
}
