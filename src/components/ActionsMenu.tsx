import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
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
  const dragControls = useDragControls()
  const [isMobileMenu, setIsMobileMenu] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)

  useFocusTrap(menuRef, open)

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
    if (!open) return
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
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
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

      <AnimatePresence>
        {open && [
          <motion.div key="backdrop"
            className="sm:hidden fixed inset-0 z-40 bg-black/50"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />,
          <motion.div key="panel"
            role="menu"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            drag={isMobileMenu ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) close()
            }}
            initial={isMobileMenu ? { y: '100%' } : { opacity: 0, y: -8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={isMobileMenu ? { y: '100%' } : { opacity: 0, y: -8 }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-tint/10 sm:rounded-xl sm:border sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:z-30 sm:mt-2 sm:w-64 ${lang === 'he' ? 'sm:left-0' : 'sm:right-0'} bg-bg shadow-2xl p-2 max-h-[75vh] overflow-y-auto`}
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))', bottom: 'var(--cook-dock-bar-height, 0px)' }}
          >
            <div
              className="sm:hidden -mx-2 px-2 pt-1 pb-3 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={e => dragControls.start(e)}
            >
              <div className="w-10 h-1 rounded-full bg-tint/20 mx-auto" />
            </div>

            {items.map(item => (
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
            ))}
          </motion.div>,
        ]}
      </AnimatePresence>
    </div>
  )
}
