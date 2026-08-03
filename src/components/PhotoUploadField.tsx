import { useState } from 'react'
import { useAuth } from '@clerk/react'
import ImageCropModal from './ImageCropModal'

interface PhotoUploadFieldProps {
  image: string
  onChange: (url: string) => void
  uploadSlug: string
  lang: 'he' | 'en'
  onError?: (message: string) => void
}

export default function PhotoUploadField({ image, onChange, uploadSlug, lang, onError }: PhotoUploadFieldProps) {
  const { getToken } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

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
        body: JSON.stringify({ recipeSlug: uploadSlug, contentType: 'image/jpeg', purpose: 'recipe' }),
      })
      if (!presignRes.ok) throw new Error('presign failed')
      const { uploadUrl, publicUrl } = await presignRes.json()
      const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
      if (!uploadResult.ok) throw new Error('upload failed')
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
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelected} disabled={uploading} className="hidden" />
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
          uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
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
      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} lang={lang} onCancel={closeCropModal} onConfirm={handleCropConfirm} />
      )}
    </>
  )
}
