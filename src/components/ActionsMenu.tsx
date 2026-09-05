import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from '@base-ui/react/drawer'
import { useFocusTrap } from '../hooks/useFocusTrap'

export interface ActionsMenuItem {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

interface ActionsMenuProps {
  items: ActionsMenuItem[]
  triggerLabel: string
  lang: 'he' | 'en'
  triggerClassName?: string
}

// Shared "..." overflow menu shell: an anchored dropdown on desktop, a
// draggable bottom sheet on mobile (same markup either way - only the
// motion values and positioning classes switch on a matchMedia check).
// Used by RecipeDetail and CollectionsPage so both stay visually and
// behaviorally identical instead of drifting apart over time.
export default function ActionsMenu({ items, triggerLabel, lang, triggerClassName }: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isMobileMenu, setIsMobileMenu] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)

  useFocusTrap(menuRef, open && !isMobileMenu)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = () => setIsMobileMenu(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function close() {
    setOpen(false)
  }

  useEffect(() => {
    if (!open || isMobileMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, isMobileMenu])

  function renderItems() {
    return items.map(item => (
      <button type="button"
        key={item.key}
        onClick={() => { close(); item.onClick() }}
        disabled={item.disabled}
        className={`flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
          item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-cream/80 hover:bg-tint/[0.06]'
        }`}
      >
        <span className="w-4 h-4 shrink-0 flex items-center justify-center">{item.icon}</span>
        {item.label}
      </button>
    ))
  }

  const trigger = (
    <button type="button"
      onClick={() => setOpen(v => !v)}
      title={triggerLabel}
      aria-label={triggerLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      className={triggerClassName ?? 'flex items-center justify-center p-2 text-cream/40 hover:text-cream/70 rounded-lg transition-colors'}
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="5" r="1.75" />
        <circle cx="12" cy="12" r="1.75" />
        <circle cx="12" cy="19" r="1.75" />
      </svg>
    </button>
  )

  if (isMobileMenu) {
    return (
      <div className="relative" ref={menuRef}>
        {trigger}
        <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="down">
          <Drawer.Portal>
            <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
            <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
              <Drawer.Popup
                role="menu"
                dir={lang === 'he' ? 'rtl' : 'ltr'}
                className="w-full max-h-[75vh] mb-[var(--cook-dock-bar-height,0px)] rounded-t-2xl border-t border-tint/10 bg-bg shadow-2xl p-2 overflow-y-auto outline-none transition-transform duration-200 [transform:translateY(var(--drawer-swipe-movement-y))] data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full"
                style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
              >
                <div className="-mx-2 px-2 pt-1 pb-3 cursor-grab active:cursor-grabbing">
                  <div className="w-10 h-1 rounded-full bg-tint/20 mx-auto" />
                </div>
                <Drawer.Content>{renderItems()}</Drawer.Content>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div key="panel"
            role="menu"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            initial={{ opacity: 0, y: -8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className={`absolute z-30 top-full mt-2 w-64 ${lang === 'he' ? 'left-0' : 'right-0'} rounded-xl border border-tint/10 bg-bg shadow-2xl p-2 max-h-[75vh] overflow-y-auto`}
          >
            {renderItems()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
