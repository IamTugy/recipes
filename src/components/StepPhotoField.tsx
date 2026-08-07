import { useState } from 'react'
import { useAuth } from '@clerk/react'

interface StepPhotoFieldProps {
  image: string | undefined
  onChange: (url: string | undefined) => void
  uploadRecipeId: string
  lang: 'he' | 'en'
}

// A smaller, upload-only sibling of PhotoUploadField for per-step photos -
// no crop/enhance here, just attach or remove a picture for this one step.
export default function StepPhotoField({ image, onChange, uploadRecipeId, lang }: StepPhotoFieldProps) {
  const { getToken } = useAuth()
  const [uploading, setUploading] = useState(false)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const token = await getToken()
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipeId: uploadRecipeId, contentType: file.type, purpose: 'recipe' }),
      })
      if (!presignRes.ok) throw new Error('presign failed')
      const { uploadUrl, publicUrl } = await presignRes.json()
      const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!uploadResult.ok) throw new Error('upload failed')
      onChange(publicUrl)
    } catch {
      /* step photos are optional - fail quietly */
    } finally {
      setUploading(false)
    }
  }

  if (image) {
    return (
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-tint/10 group">
        <img src={image} alt="" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={lang === 'he' ? 'הסר תמונה' : 'Remove photo'}
          className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <label className="w-16 h-16 shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-tint/15 text-cream/25 hover:text-cream/50 hover:border-tint/25 cursor-pointer transition-colors">
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelected} disabled={uploading} className="hidden" />
      {uploading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[9px]">{lang === 'he' ? 'תמונה' : 'Photo'}</span>
        </>
      )}
    </label>
  )
}
