import { useState } from 'react'
import { useAuth } from '@clerk/react'
import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'

interface EnhanceImageModalProps {
  imageUrl: string
  uploadRecipeId: string
  lang: 'he' | 'en'
  onCancel: () => void
  onApplied: (publicUrl: string) => void
}

interface Preset {
  label: { he: string; en: string }
  instructions: string
}

// Quick-suggestion chips, same idea as Photoroom/Canva Magic Edit/Google
// Photos Magic Editor's preset styles - they fill the text box rather than
// firing immediately, so the request stays visible and editable.
const PRESETS: Preset[] = [
  { label: { he: 'מקצועי', en: 'Professional' }, instructions: 'Give it a professional studio food-photography look: clean styling, soft even lighting, and a polished composition.' },
  { label: { he: 'בטבע', en: 'In nature' }, instructions: 'Show the dish outdoors in a natural setting, like on a rustic wooden table with soft natural sunlight.' },
  { label: { he: 'רקע נקי', en: 'Clean background' }, instructions: 'Simplify and blur the background so the dish is the clear focus.' },
  { label: { he: 'תאורה חמה', en: 'Warm & cozy' }, instructions: 'Give it warm, cozy evening lighting like a home kitchen.' },
  { label: { he: 'מקרוב', en: 'Close-up' }, instructions: 'Reframe as a close-up shot emphasizing the food\'s texture and detail.' },
]

export default function EnhanceImageModal({ imageUrl, uploadRecipeId, lang, onCancel, onApplied }: EnhanceImageModalProps) {
  const { getToken } = useAuth()
  const [instructions, setInstructions] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyPreset(preset: Preset) {
    setInstructions(prev => (prev.trim() ? `${prev.trim()}. ${preset.instructions}` : preset.instructions))
  }

  async function handleGenerate() {
    setEnhancing(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/uploads/enhance-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipeId: uploadRecipeId, imageUrl, instructions: instructions.trim() || undefined }),
      })
      if (!res.ok) throw new Error('enhance failed')
      const { publicUrl } = await res.json()
      onApplied(publicUrl)
    } catch {
      setError(lang === 'he' ? 'שיפור התמונה נכשל' : 'Photo enhancement failed')
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <Modal open onOpenChange={next => { if (!next && !enhancing) onCancel() }} zIndexClassName="z-50" panelClassName="max-w-lg p-5 space-y-4">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">
        {lang === 'he' ? 'שפר תמונה עם AI' : 'Enhance photo with AI'}
      </Dialog.Title>

      <div className="relative w-full h-56 rounded-lg overflow-hidden bg-black/40">
        <img src={imageUrl} alt="" className="w-full h-full object-contain" />
        {enhancing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <svg className="w-8 h-8 animate-spin text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(preset => (
          <button
            key={preset.label.en}
            type="button"
            onClick={() => applyPreset(preset)}
            disabled={enhancing}
            className="px-2.5 py-1 rounded-full text-xs font-medium border border-tint/10 text-cream/60 hover:text-cream/90 hover:border-amber/30 transition-colors disabled:opacity-40"
          >
            {lang === 'he' ? preset.label.he : preset.label.en}
          </button>
        ))}
      </div>

      <textarea
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        disabled={enhancing}
        placeholder={lang === 'he'
          ? 'מה תרצו לשנות בתמונה? (אופציונלי)'
          : 'What would you like to change about the photo? (optional)'}
        rows={3}
        maxLength={300}
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none disabled:opacity-50"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={enhancing} className="btn-ghost disabled:opacity-50">
          {lang === 'he' ? 'ביטול' : 'Cancel'}
        </button>
        <button type="button" onClick={handleGenerate} disabled={enhancing} className="btn-primary disabled:opacity-50">
          {enhancing
            ? (lang === 'he' ? 'משפר...' : 'Enhancing...')
            : (lang === 'he' ? 'שפר תמונה' : 'Generate')}
        </button>
      </div>
    </Modal>
  )
}
