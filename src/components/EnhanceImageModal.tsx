import { useState } from 'react'
import { useAuth } from '@clerk/react'
import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'
import { t } from "../i18n";

interface EnhanceImageModalProps {
  imageUrl: string
  uploadRecipeId: string
  lang: 'he' | 'en'
  onCancel: () => void
  onApplied: (publicUrl: string) => void
}

interface Preset {
  label: { he: string; en: string }
  instructions: { he: string; en: string }
}

// Quick-suggestion chips, same idea as Photoroom/Canva Magic Edit/Google
// Photos Magic Editor's preset styles - they fill the text box rather than
// firing immediately, so the request stays visible and editable. Each
// preset's text is written in the user's own language (Gemini understands
// either fine) rather than always English, matching what the chip itself
// says.
const PRESETS: Preset[] = [
  {
    label: { he: 'מקצועי', en: 'Professional' },
    instructions: {
      he: 'תנו לזה מראה מקצועי של צילום אוכל בסטודיו: עיצוב נקי, תאורה רכה ואחידה, וקומפוזיציה מלוטשת.',
      en: 'Give it a professional studio food-photography look: clean styling, soft even lighting, and a polished composition.',
    },
  },
  {
    label: { he: 'בטבע', en: 'In nature' },
    instructions: {
      he: 'הציגו את המנה בחוץ בסביבה טבעית, כמו על שולחן עץ כפרי עם אור שמש טבעי ורך.',
      en: 'Show the dish outdoors in a natural setting, like on a rustic wooden table with soft natural sunlight.',
    },
  },
  {
    label: { he: 'רקע נקי', en: 'Clean background' },
    instructions: {
      he: 'פשטו וטשטשו את הרקע כך שהמנה תהיה במוקד הברור.',
      en: 'Simplify and blur the background so the dish is the clear focus.',
    },
  },
  {
    label: { he: 'תאורה חמה', en: 'Warm & cozy' },
    instructions: {
      he: 'תנו לזה תאורת ערב חמה ונעימה כמו במטבח ביתי.',
      en: 'Give it warm, cozy evening lighting like a home kitchen.',
    },
  },
  {
    label: { he: 'מקרוב', en: 'Close-up' },
    instructions: {
      he: 'מסגרו מחדש כתמונת קלוז-אפ שמדגישה את המרקם והפרטים של המאכל.',
      en: 'Reframe as a close-up shot emphasizing the food\'s texture and detail.',
    },
  },
]

export default function EnhanceImageModal({ imageUrl, uploadRecipeId, lang, onCancel, onApplied }: EnhanceImageModalProps) {
  const tx = t[lang]
  const { getToken } = useAuth()
  const [instructions, setInstructions] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The freshly generated candidate, held here for review - never touches
  // the recipe until the user explicitly accepts it, so a result they don't
  // like never even reaches "undo" territory.
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  // Each preset lives on its own line, so combining several stays readable
  // instead of running together into one dense sentence. Clicking an
  // already-picked preset removes just its line (toggle), same as the chip
  // un-highlighting - clicking again re-adds it.
  function togglePreset(preset: Preset) {
    const text = preset.instructions[lang]
    setInstructions(prev => {
      const lines = prev.split('\n').filter(line => line.trim() !== '')
      const index = lines.indexOf(text)
      if (index !== -1) {
        lines.splice(index, 1)
      } else {
        lines.push(text)
      }
      return lines.length ? `${lines.join('\n')}\n` : ''
    })
  }

  function isPresetPicked(preset: Preset): boolean {
    return instructions.split('\n').includes(preset.instructions[lang])
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
      setResultUrl(publicUrl)
    } catch {
      setError(tx.photoEnhancementFailed)
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <Modal open onOpenChange={next => { if (!next && !enhancing) onCancel() }} zIndexClassName="z-50" panelClassName="max-w-lg p-5 space-y-4">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">
        {resultUrl
          ? (tx.doesThisLookRight)
          : (tx.enhancePhotoWithAI)}
      </Dialog.Title>

      <div className="relative w-full h-56 rounded-lg overflow-hidden bg-black/40">
        <img src={resultUrl ?? imageUrl} alt="" className="w-full h-full object-contain" />
        {enhancing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <svg className="w-8 h-8 animate-spin text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        )}
      </div>

      {resultUrl ? (
        <>
          <p className="text-xs text-cream/40">
            {tx.theOriginalPhotoIsnTReplaced}
          </p>
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onCancel} className="btn-ghost">
              {tx.cancel}
            </button>
            <button type="button" onClick={() => setResultUrl(null)} className="btn-ghost">
              {tx.tryAgain}
            </button>
            <button type="button" onClick={() => onApplied(resultUrl)} className="btn-primary">
              {tx.useThisPhoto}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(preset => {
              const picked = isPresetPicked(preset)
              return (
                <button
                  key={preset.label.en}
                  type="button"
                  onClick={() => togglePreset(preset)}
                  disabled={enhancing}
                  aria-pressed={picked}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-40 ${
                    picked
                      ? 'bg-amber/15 border-amber/40 text-amber'
                      : 'border-tint/10 text-cream/60 hover:text-cream/90 hover:border-amber/30'
                  }`}
                >
                  {lang === 'he' ? preset.label.he : preset.label.en}
                </button>
              )
            })}
          </div>

          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            disabled={enhancing}
            placeholder={tx.whatWouldYouLikeToChange}
            rows={3}
            maxLength={600}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none disabled:opacity-50"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={enhancing} className="btn-ghost disabled:opacity-50">
              {tx.cancel}
            </button>
            <button type="button" onClick={handleGenerate} disabled={enhancing} className="btn-primary disabled:opacity-50">
              {enhancing
                ? (tx.enhancing)
                : (tx.generate)}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
