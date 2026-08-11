import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import type { ShoppingListItem } from '../hooks/useShoppingList'
import { useLanguage } from '../hooks/useLanguage'
import { formatAggregatedAmount } from '../lib/shoppingListAggregation'
import { t } from "../i18n";

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
        const tx = t[lang]
  const [copied, setCopied] = useState(false)

  const title = tx.shoppingList2

  function listText() {
    const lines = items.map(item => {
      const amount = formatAggregatedAmount(item.amount, item.unit, lang)
      return amount ? `${amount} ${item.name}` : item.name
    })
    return `${title}\n${lines.join('\n')}`
  }

  async function copyAsText() {
    try {
      await navigator.clipboard.writeText(listText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  function printList() {
    document.body.classList.add('printing-shopping-list')
    const cleanup = () => {
      document.body.classList.remove('printing-shopping-list')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  async function shareList() {
    const text = listText()
    if (navigator.share) {
      try {
        await navigator.share({ title, text })
      } catch { /* user cancelled share */ }
    } else {
      await copyAsText()
    }
  }

  return (
    <>
      {items.length > 0 && (
        <div className="hidden print:block">
          <h1 className="text-xl font-bold mb-4">{title}</h1>
          <ul className="space-y-1">
            {items.map(item => {
              const amount = formatAggregatedAmount(item.amount, item.unit, lang)
              return (
                <li key={item.id} className="text-sm">
                  ☐ {amount ? `${amount} ` : ''}{item.name}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="print:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Viewport className="print:hidden fixed inset-0 z-50">
            <Dialog.Popup
              className={`fixed top-0 h-full w-full sm:w-96 bg-card shadow-2xl flex flex-col transition-transform duration-150 ${lang === 'he' ? 'left-0 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full' : 'right-0 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full'}`}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
            <div className="flex items-center justify-between px-5 h-14 border-b border-tint/[0.06]">
              <h2 className="font-serif text-lg font-medium text-cream">
                {title}
              </h2>
              <button type="button"
                onClick={onClose}
                aria-label={tx.close}
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
                  {tx.undo}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p className="text-cream/30 text-sm text-center py-12">
                  {tx.yourShoppingListIsEmpty}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map(item => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 group py-1.5 border-b border-tint/[0.04] last:border-0"
                    >
                      <button type="button"
                        onClick={() => onToggle(item.id)}
                        aria-label={item.checked
                          ? (tx.markAsNotCollected)
                          : (tx.markAsCollected)}
                        className={`shrink-0 h-8 w-8 sm:h-5 sm:w-5 rounded-md border flex items-center justify-center transition-colors ${
                          item.checked ? 'bg-herb border-herb text-white' : 'border-tint/20 text-transparent'
                        }`}
                      >
                        {item.checked && '✓'}
                      </button>
                      <p className={`flex-1 min-w-0 text-sm truncate ${item.checked ? 'text-cream/30 line-through' : 'text-cream/85'}`}>
                        {(() => {
                          const amount = formatAggregatedAmount(item.amount, item.unit, lang)
                          return amount ? `${amount} ` : ''
                        })()}{item.name}
                      </p>
                      <button type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={tx.removeItem}
                        className="shrink-0 h-8 w-8 sm:h-6 sm:w-6 flex items-center justify-center rounded text-cream/30 sm:text-cream/20 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && (
              <div className="px-5 py-3 border-t border-tint/[0.06] space-y-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={shareList} className="btn-ghost text-xs flex-1">
                    {tx.share}
                  </button>
                  <button type="button" onClick={copyAsText} className="btn-ghost text-xs flex-1">
                    {copied
                      ? (tx.copied)
                      : (tx.copyAsText)}
                  </button>
                  <button type="button" onClick={printList} className="btn-ghost text-xs flex-1">
                    {tx.print}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={onClearChecked} className="btn-ghost text-xs flex-1">
                    {tx.clearChecked}
                  </button>
                  <button type="button" onClick={onClearAll} className="btn-ghost text-xs flex-1 text-red-400/80">
                    {tx.clearAll}
                  </button>
                </div>
              </div>
            )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
