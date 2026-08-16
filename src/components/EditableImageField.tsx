import { useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'
import ImageCropModal from './ImageCropModal'
import EnhanceImageModal from './EnhanceImageModal'
import { t } from "../i18n";

interface EditableImageFieldProps {
  image: string | undefined
  onChange: (url: string | undefined) => void
  uploadRecipeId: string
  lang: 'he' | 'en'
  // Present only when editing an existing, already-saved recipe - enables
  // the "Save image" partial-save path (nothing to partially save for a
  // recipe that hasn't been created yet).
  recipeId?: string
  onError?: (message: string) => void
  // Main-photo usage is a big dropzone with visible label text; step-photo
  // usage is a small square thumbnail. Same modal (crop + enhance + save)
  // either way.
  size?: 'large' | 'small'
}

export default function EditableImageField({ image, onChange, uploadRecipeId, lang, recipeId, onError, size = 'large' }: EditableImageFieldProps) {
  const tx = t[lang]
  const { getToken } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // Single-level undo for the last accepted AI enhance - cleared by any
  // other change (fresh upload, another enhance) so it never points at a
  // stale photo.
  const [preEnhanceImage, setPreEnhanceImage] = useState<string | null>(null)
  const busy = uploading
  // A ref, not a DOM id lookup - every step in a recipe shares the same
  // uploadRecipeId+size, so an id built from just those two (as this used
  // to be) collides across every step's hidden input. document.getElementById
  // always resolves to the FIRST matching element, so clicking "upload" on
  // any step actually opened step 1's file input - the picked photo landed
  // on whichever step happened to be first in the DOM, not the one clicked.
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onError?.(tx.unsupportedFileType)
      return
    }
    setCropSrc(URL.createObjectURL(file))
  }

  function closeCropModal() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  async function uploadBlob(blob: Blob, contentType: string): Promise<string> {
    const token = await getToken()
    const presignRes = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ recipeId: uploadRecipeId, contentType, purpose: 'recipe' }),
    })
    if (!presignRes.ok) throw new Error('presign failed')
    const { uploadUrl, publicUrl } = await presignRes.json()
    const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
    if (!uploadResult.ok) throw new Error('upload failed')
    return publicUrl
  }

  async function handleCropConfirm(blob: Blob) {
    closeCropModal()
    setUploading(true)
    try {
      const publicUrl = await uploadBlob(blob, 'image/jpeg')
      setPreEnhanceImage(null)
      onChange(publicUrl)
    } catch {
      onError?.(tx.photoUploadFailed)
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveImage() {
    if (!recipeId || !image) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/recipes/${recipeId}/image`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image }),
      })
      if (!res.ok) throw new Error('save image failed')
    } catch {
      onError?.(tx.savingThePhotoFailed)
    } finally {
      setSaving(false)
    }
  }

  const thumbClass = size === 'large'
    ? 'relative block w-full h-48 rounded-xl overflow-hidden border border-tint/10 bg-tint/[0.03] cursor-pointer group'
    : 'relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-tint/10 bg-tint/[0.03] cursor-pointer group'

  return (
    <>
      <button
        type="button"
        onClick={() => image ? setModalOpen(true) : fileInputRef.current?.click()}
        className={thumbClass}
      >
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelected} disabled={busy} className="hidden" />
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : size === 'large' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-cream/25">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">{tx.uploadAPhoto}</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-cream/25">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[9px]">{tx.photo}</span>
          </div>
        )}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
          busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <span className={size === 'large' ? 'text-xs font-semibold text-white' : 'text-[9px] font-semibold text-white'}>
            {uploading
              ? (tx.uploading)
              : image
                ? (tx.edit)
                : (tx.upload)}
          </span>
        </div>
      </button>

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

      {modalOpen && image && (
        <Modal open onOpenChange={next => { if (!next) setModalOpen(false) }} zIndexClassName="z-40" panelClassName="max-w-sm p-5 space-y-4">
          <Dialog.Title className="font-serif text-lg font-bold text-cream">
            {tx.photo}
          </Dialog.Title>
          <div className="relative w-full h-40 rounded-lg overflow-hidden bg-black/40">
            <img src={image} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => { setModalOpen(false); fileInputRef.current?.click() }}
              className="btn-ghost text-sm"
            >
              {tx.replacePhoto}
            </button>
            <button
              type="button"
              onClick={() => { setModalOpen(false); setEnhanceOpen(true) }}
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-amber hover:text-amber/80 transition-colors py-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              {tx.enhanceWithAI}
            </button>
            {preEnhanceImage && (
              <button
                type="button"
                onClick={() => { onChange(preEnhanceImage); setPreEnhanceImage(null); setModalOpen(false) }}
                className="flex items-center justify-center gap-1 text-xs font-medium text-cream/40 hover:text-cream/70 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                {tx.undoEnhance}
              </button>
            )}
            {recipeId && (
              <button type="button" onClick={handleSaveImage} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? (tx.saving) : (tx.saveImage)}
              </button>
            )}
            <button type="button" onClick={() => onChange(undefined)} className="text-xs text-red-400/70 hover:text-red-400">
              {tx.removePhoto}
            </button>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost text-sm">
              {tx.close}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
