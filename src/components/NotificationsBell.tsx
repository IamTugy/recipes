import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { useLanguage } from '../hooks/useLanguage'
import Avatar from './Avatar'
import { t } from '../i18n'

export default function NotificationsBell() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { unreadCount, notifications, loading, loadNotifications, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next) {
      loadNotifications()
      void markAllRead()
    }
  }

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
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
        onClick={toggleOpen}
        className="relative h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
        title={tx.notifications}
        aria-label={tx.notifications}
        aria-expanded={open}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full mt-2 w-72 max-h-96 overflow-y-auto card p-2 z-50"
          dir={lang === 'he' ? 'rtl' : 'ltr'}
        >
          {loading ? (
            <p className="text-cream/30 text-xs text-center py-4">{tx.loading}</p>
          ) : notifications.length === 0 ? (
            <p className="text-cream/30 text-xs text-center py-4">{tx.noNotificationsYet}</p>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate(n.type === 'new_rating' && n.recipeId ? `/recipes/${n.recipeId}` : `/chef/${n.actorId}`)
                }}
                className="w-full flex items-center gap-3 text-start px-2 py-2 rounded-lg text-sm text-cream/80 hover:bg-tint/[0.06] transition-colors"
              >
                <Avatar name={n.actorName ?? tx.chef} imageUrl={n.actorImageUrl} size="sm" />
                <span className="min-w-0 truncate">
                  {n.type === 'new_follower' && tx.startedFollowingYou(n.actorName ?? tx.chef)}
                  {n.type === 'new_rating' && tx.ratedYourRecipe(n.actorName ?? tx.chef)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
