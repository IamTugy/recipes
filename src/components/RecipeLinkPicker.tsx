import { useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import Modal from './Modal'
import { useMyRecipes, useRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'

interface LinkTarget {
  id: string
  title: string
  titleHe?: string
}

interface RecipeLinkPickerProps {
  excludeId?: string
  onSelect: (recipe: LinkTarget) => void
  onClose: () => void
}

// Searches recipes already loaded client-side (the user's own + published
// site-wide) rather than hitting a new search endpoint - same data Home's
// own search already filters.
export default function RecipeLinkPicker({ excludeId, onSelect, onClose }: RecipeLinkPickerProps) {
  const { lang } = useLanguage()
  const [query, setQuery] = useState('')
  const { recipes: mine } = useMyRecipes()
  const { recipes: published } = useRecipes()

  const options = useMemo(() => {
    const merged = new Map<string, LinkTarget>()
    for (const r of [...published, ...mine]) {
      if (r.id === excludeId) continue
      merged.set(r.id, { id: r.id, title: r.title, titleHe: r.titleHe })
    }
    const q = query.trim().toLowerCase()
    return [...merged.values()]
      .filter(r => !q || r.title.toLowerCase().includes(q) || (r.titleHe ?? '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [mine, published, query, excludeId])

  return (
    <Modal open onOpenChange={next => { if (!next) onClose() }} zIndexClassName="z-50" panelClassName="max-w-md p-5 space-y-3">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">
        {lang === 'he' ? 'קשר למתכון' : 'Link to a recipe'}
      </Dialog.Title>
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={lang === 'he' ? 'חיפוש מתכון...' : 'Search recipes...'}
        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
      />
      <div className="max-h-72 overflow-y-auto space-y-1">
        {options.length === 0 && (
          <p className="text-xs text-cream/30 text-center py-6">{lang === 'he' ? 'לא נמצאו מתכונים' : 'No recipes found'}</p>
        )}
        {options.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            className="w-full text-start p-2 rounded-lg text-sm text-cream/80 hover:bg-tint/10 transition-colors truncate"
          >
            {lang === 'he' ? (r.titleHe || r.title) : r.title}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">
          {lang === 'he' ? 'סגור' : 'Close'}
        </button>
      </div>
    </Modal>
  )
}
