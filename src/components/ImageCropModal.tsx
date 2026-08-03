import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { getCroppedImageBlob } from '../lib/cropImage'

interface ImageCropModalProps {
  imageSrc: string
  lang: 'he' | 'en'
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

export default function ImageCropModal({ imageSrc, lang, onCancel, onConfirm }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  async function handleConfirm() {
    if (!croppedArea) return
    setProcessing(true)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedArea)
      onConfirm(blob)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-5 space-y-4">
        <h2 className="font-serif text-lg font-bold text-cream">
          {lang === 'he' ? 'התאמת תמונה' : 'Adjust photo'}
        </h2>
        <div className="relative w-full h-80 rounded-lg overflow-hidden bg-black/40">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={16 / 9}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => setCroppedArea(areaPixels)}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-cream/50 shrink-0">{lang === 'he' ? 'זום' : 'Zoom'}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button type="button" onClick={handleConfirm} disabled={!croppedArea || processing} className="btn-primary disabled:opacity-50">
            {processing ? (lang === 'he' ? 'שומר...' : 'Saving...') : (lang === 'he' ? 'אישור' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
