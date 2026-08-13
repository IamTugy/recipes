import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Dialog } from '@base-ui/react/dialog'
import { useAuth, useUser, useClerk } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'
import { useMyRecipes } from '../hooks/useRecipes'
import { savePreferences } from '../lib/preferences'
import Avatar from './Avatar'
import type { useSidebar } from '../hooks/useSidebar'
import { t } from "../i18n";

interface SidebarProps {
  sidebar: ReturnType<typeof useSidebar>
}

interface SidebarLinkDef {
  key: string
  label: string
  path: string
  icon: ReactNode
  badge?: number
}

export default function Sidebar({ sidebar }: SidebarProps) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = sidebar
  const navigate = useNavigate()
  const location = useLocation()
  const { lang, setLang } = useLanguage()
        const tx = t[lang]
  const { recipes: myRecipes } = useMyRecipes()
  const attentionCount = myRecipes.filter(r => r.status === 'rejected').length

  // Account section (avatar/name/manage-account up top, language/theme/sign
  // out down at the bottom) - merged in from what used to be Clerk's
  // UserButton dropdown in Nav.tsx, now living directly in the sidebar.
  const { theme, setMode } = useTheme()
  const { getToken } = useAuth()
  const { user, isSignedIn } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const displayName = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || tx.aCook

  // Acts on the currently *displayed* theme, not the abstract mode - a
  // first-time visitor's mode starts as "system" (unset), and if that
  // happens to resolve to the same theme already showing, toggling mode
  // through a 3rd "system" step made the first click look like it did
  // nothing (label changed, page didn't) and only the second click visibly
  // switched. Every click now flips light<->dark immediately.
  const themeLabel = theme === 'light' ? (tx.darkMode) : (tx.lightMode)
  const themeIcon = theme === 'light' ? '🌙' : '☀️'

  function handleLangClick() {
    const next = lang === 'he' ? 'en' : 'he'
    setLang(next)
    if (isSignedIn) void savePreferences({ lang: next }, getToken)
  }

  function handleThemeClick() {
    const next = theme === 'light' ? 'dark' : 'light'
    setMode(next)
    if (isSignedIn) void savePreferences({ theme: next }, getToken)
  }

  const recipeLinks: SidebarLinkDef[] = [
    {
      key: 'home', label: tx.home, path: '/',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-14 0v8a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1v-8m-16 0l2-2" />
        </svg>
      ),
    },
    {
      key: 'my-recipes', label: tx.myRecipes, path: '/my-recipes',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      badge: attentionCount > 0 ? attentionCount : undefined,
    },
    { key: 'collections', label: tx.myCollections, path: '/collections', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">📚</span> },
    { key: 'meal-plan', label: tx.mealPlan, path: '/meal-plan', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">🗓️</span> },
  ]

  const moreLinks: SidebarLinkDef[] = [
    { key: 'leaderboard', label: tx.leaderboard, path: '/leaderboard', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">🏆</span> },
    { key: 'feature-requests', label: tx.featureRequests, path: '/feature-requests', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">💡</span> },
    {
      key: 'submissions',
      label: tx.submissions,
      path: '/submissions',
      icon: <span className="w-4 h-4 flex items-center justify-center text-sm">✅</span>,
    },
    { key: 'jobs', label: tx.jobs, path: '/jobs', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">⏳</span> },
  ]

  function renderLink(link: SidebarLinkDef, showLabel: boolean, onNavigate?: () => void) {
    const active = location.pathname === link.path
    return (
      <button
        key={link.key}
        type="button"
        onClick={() => { navigate(link.path); onNavigate?.() }}
        title={link.label}
        className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full ${
          active ? 'bg-amber/10 text-amber' : 'text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05]'
        }`}
      >
        <span className="shrink-0">{link.icon}</span>
        {showLabel && <span className="truncate">{link.label}</span>}
        {link.badge !== undefined && (
          <span className={`shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center ${showLabel ? 'ms-auto' : 'absolute top-0 end-0'}`}>
            {link.badge}
          </span>
        )}
      </button>
    )
  }

  function content(showLabel: boolean, onNavigate?: () => void) {
    return (
      <div className="flex flex-col h-full">
        {isSignedIn && showLabel && (
          <div className="p-3 border-b border-tint/[0.06] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={displayName} imageUrl={user?.imageUrl ?? null} />
              <span className="truncate text-sm text-cream/80">{displayName}</span>
            </div>
            <button
              type="button"
              onClick={() => openUserProfile()}
              title={tx.manageAccount}
              aria-label={tx.manageAccount}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        )}

        <div className="p-3">
          <button
            type="button"
            onClick={() => { navigate('/recipes/new'); onNavigate?.() }}
            title={tx.newRecipe2}
            className={`flex items-center gap-2 w-full rounded-lg border border-tint/10 hover:bg-tint/[0.05] text-cream/80 px-3 py-2 text-sm font-medium transition-colors ${showLabel ? '' : 'justify-center'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {showLabel && (tx.newRecipe2)}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-4">
          <div className="space-y-1">
            {showLabel && <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-cream/30 mb-1">{tx.recipes2}</div>}
            {recipeLinks.map(link => renderLink(link, showLabel, onNavigate))}
          </div>
          <div className="space-y-1">
            {showLabel && <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-cream/30 mb-1">{tx.more}</div>}
            {moreLinks.map(link => renderLink(link, showLabel, onNavigate))}
          </div>
        </nav>

        {showLabel && (
          <div className="p-3 border-t border-tint/[0.06] space-y-1">
            <button
              type="button"
              onClick={handleLangClick}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05] transition-colors"
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center text-sm">🌐</span>
              {lang === 'he' ? 'English' : 'עברית'}
            </button>
            <button
              type="button"
              onClick={handleThemeClick}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05] transition-colors"
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center text-sm">{themeIcon}</span>
              {themeLabel}
            </button>
            {isSignedIn && (
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H2.25" />
                </svg>
                {tx.signOut}
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="hidden sm:flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={lang === 'he' ? 'M8.25 4.5l7.5 7.5-7.5 7.5' : 'M15.75 4.5l-7.5 7.5 7.5 7.5'} />
              </svg>
              {tx.collapse}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Desktop pinned sidebar */}
      <aside className={`print:hidden hidden sm:flex sm:flex-col fixed top-14 bottom-0 z-30 bg-bg transition-[width] duration-200 ${lang === 'he' ? 'right-0 border-l' : 'left-0 border-r'} border-tint/[0.06] ${collapsed ? 'w-16' : 'w-60'}`}>
        {collapsed ? (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden">{content(false)}</div>
            <div className="p-3 border-t border-tint/[0.06]">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="flex items-center justify-center w-full rounded-lg px-3 py-2 text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={lang === 'he' ? 'M15.75 4.5l-7.5 7.5 7.5 7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
                </svg>
              </button>
            </div>
          </div>
        ) : content(true)}
      </aside>

      {/* Mobile drawer */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="print:hidden sm:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Viewport className="print:hidden sm:hidden fixed inset-0 z-50">
            <Dialog.Popup className={`fixed top-0 bottom-0 w-72 bg-bg shadow-2xl transition-transform duration-150 ${lang === 'he' ? 'right-0 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full' : 'left-0 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full'}`}>
              {content(true, () => setMobileOpen(false))}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
