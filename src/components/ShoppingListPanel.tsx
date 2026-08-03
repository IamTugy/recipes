import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ShoppingListItem } from '../hooks/useShoppingList'
import { useLanguage } from '../hooks/useLanguage'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ShoppingListPanelProps {
  open: boolean
  onClose: () => void
  items: ShoppingListItem[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onClearChecked: () => void
  onClearAll: () => void
  lastCleared: ShoppingListItem[] | null
  onUndoClear: () => void
}

export default function ShoppingListPanel({
  open, onClose, items, onToggle, onRemove, onClearChecked, onClearAll, lastCleared, onUndoClear,
}: ShoppingListPanelProps) {
  const { lang } = useLanguage()
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  const groups = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    const group = groups.get(item.recipeTitle) ?? []
    group.push(item)
    groups.set(item.recipeTitle, group)
  }

  async function copyAsText() {
    const text = [...groups.entries()]
      .map(([recipeTitle, groupItems]) => {
        const lines = groupItems.map(item => `- ${item.amount ? `${item.amount} ` : ''}${item.name}`).join('\n')
        return `${recipeTitle}\n${lines}`
      })
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      {items.length > 0 && (
        <div className="hidden print:block">
          <h1 className="text-xl font-bold mb-4">{lang === 'he' ? 'רשימת קניות' : 'Shopping List'}</h1>
          <div className="space-y-4">
            {[...groups.entries()].map(([recipeTitle, groupItems]) => (
              <div key={recipeTitle}>
                <h2 className="text-sm font-semibold uppercase tracking-wider mb-1">{recipeTitle}</h2>
                <ul className="space-y-1">
                  {groupItems.map(item => (
                    <li key={item.id} className="text-sm">
                      ☐ {item.amount ? `${item.amount} ` : ''}{item.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="print:hidden fixed inset-0 bg-black/40 z-40"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="print:hidden fixed top-0 right-0 h-full w-full sm:w-96 bg-card z-50 shadow-2xl flex flex-col"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between px-5 h-14 border-b border-tint/[0.06]">
              <h2 className="font-serif text-lg font-medium text-cream">
                {lang === 'he' ? 'רשימת קניות' : 'Shopping List'}
              </h2>
              <button type="button"
                onClick={onClose}
                aria-label={lang === 'he' ? 'סגור' : 'Close'}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/50 hover:text-cream hover:bg-tint/[0.06] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {lastCleared && lastCleared.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-5 py-2 bg-amber/10 border-b border-amber/20 text-xs">
                <span className="text-cream/70">
                  {lang === 'he'
                    ? `${lastCleared.length} פריטים הוסרו`
                    : `${lastCleared.length} item${lastCleared.length === 1 ? '' : 's'} removed`}
                </span>
                <button type="button" onClick={onUndoClear} className="font-semibold text-amber hover:text-amber/80 transition-colors">
                  {lang === 'he' ? 'בטל' : 'Undo'}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p className="text-cream/30 text-sm text-center py-12">
                  {lang === 'he' ? 'הרשימה ריקה' : 'Your shopping list is empty'}
                </p>
              ) : (
                <div className="space-y-5">
                  {[...groups.entries()].map(([recipeTitle, groupItems]) => (
                    <div key={recipeTitle}>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cream/30 mb-1.5 truncate">
                        {recipeTitle}
                      </h3>
                      <ul className="space-y-1.5">
                        {groupItems.map(item => (
                          <li
                            key={item.id}
                            className="flex items-center gap-3 group py-1.5 border-b border-tint/[0.04] last:border-0"
                          >
                            <button type="button"
                              onClick={() => onToggle(item.id)}
                              aria-label={item.checked
                                ? (lang === 'he' ? 'סמן כלא נאסף' : 'Mark as not collected')
                                : (lang === 'he' ? 'סמן כנאסף' : 'Mark as collected')}
                              className={`shrink-0 h-8 w-8 sm:h-5 sm:w-5 rounded-md border flex items-center justify-center transition-colors ${
                                item.checked ? 'bg-herb border-herb text-white' : 'border-tint/20 text-transparent'
                              }`}
                            >
                              {item.checked && '✓'}
                            </button>
                            <p className={`flex-1 min-w-0 text-sm truncate ${item.checked ? 'text-cream/30 line-through' : 'text-cream/85'}`}>
                              {item.amount ? `${item.amount} ` : ''}{item.name}
                            </p>
                            <button type="button"
                              onClick={() => onRemove(item.id)}
                              aria-label={lang === 'he' ? 'הסר פריט' : 'Remove item'}
                              className="shrink-0 h-8 w-8 sm:h-6 sm:w-6 flex items-center justify-center rounded text-cream/30 sm:text-cream/20 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="px-5 py-3 border-t border-tint/[0.06] space-y-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={copyAsText} className="btn-ghost text-xs flex-1">
                    {copied
                      ? (lang === 'he' ? 'הועתק!' : 'Copied!')
                      : (lang === 'he' ? 'העתק כטקסט' : 'Copy as text')}
                  </button>
                  <button type="button" onClick={() => window.print()} className="btn-ghost text-xs flex-1">
                    {lang === 'he' ? 'הדפס' : 'Print'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={onClearChecked} className="btn-ghost text-xs flex-1">
                    {lang === 'he' ? 'נקה מסומנים' : 'Clear checked'}
                  </button>
                  <button type="button" onClick={onClearAll} className="btn-ghost text-xs flex-1 text-red-400/80">
                    {lang === 'he' ? 'נקה הכל' : 'Clear all'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </>
  )
}
