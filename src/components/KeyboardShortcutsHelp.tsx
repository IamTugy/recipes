import { useLanguage } from '../hooks/useLanguage'
import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'

interface KeyboardShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

export default function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const { lang } = useLanguage()

  const shortcuts = lang === 'he'
    ? [
      { keys: '/', label: 'התמקדות בשדה החיפוש' },
      { keys: 'Esc', label: 'ניקוי חיפוש / סגירת חלונות' },
      { keys: '← →', label: 'ניווט בין שלבים במצב הדרכה' },
      { keys: '?', label: 'הצגת המקשים האלה' },
    ]
    : [
      { keys: '/', label: 'Focus the search box' },
      { keys: 'Esc', label: 'Clear search / close dialogs' },
      { keys: '← →', label: 'Navigate steps in Guided Mode' },
      { keys: '?', label: 'Show this help' },
    ]

  return (
    <Modal open={open} onOpenChange={next => { if (!next) onClose() }} zIndexClassName="z-[60]" panelClassName="max-w-sm p-6">
      <div dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between mb-4">
          <Dialog.Title className="font-serif text-lg font-bold text-cream">
            {lang === 'he' ? 'מקשי קיצור' : 'Keyboard shortcuts'}
          </Dialog.Title>
          <button type="button"
            onClick={onClose}
            aria-label={lang === 'he' ? 'סגור' : 'Close'}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-cream/50 hover:text-cream hover:bg-tint/[0.06] transition-colors"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-3">
          {shortcuts.map(s => (
            <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-cream/70">{s.label}</span>
              <kbd className="shrink-0 px-2 py-1 rounded-md bg-tint/[0.08] border border-tint/10 text-cream/60 text-xs font-mono">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
