import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { getCroppedImageBlob } from '../lib/cropImage'
import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'
import { t } from "../i18n";

interface ImageCropModalProps {
  imageSrc: string
  lang: 'he' | 'en'
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

export default function ImageCropModal({ imageSrc, lang, onCancel, onConfirm }: ImageCropModalProps) {
  const tx = t[lang]
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
    <Modal open onOpenChange={next => { if (!next) onCancel() }} zIndexClassName="z-50" panelClassName="max-w-lg p-5 space-y-4">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">
        {tx.adjustPhoto}
      </Dialog.Title>
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
        <span className="text-xs text-cream/50 shrink-0">{tx.zoom}</span>
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
          {tx.cancel}
        </button>
        <button type="button" onClick={handleConfirm} disabled={!croppedArea || processing} className="btn-primary disabled:opacity-50">
          {processing ? (tx.saving) : (tx.confirm)}
        </button>
      </div>
    </Modal>
  )
}
