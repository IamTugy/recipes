import { useNavigate } from 'react-router-dom'
import { UserButton, useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'
import { savePreferences } from '../lib/preferences'

interface NavProps {
  shoppingListCount: number
  onOpenShoppingList: () => void
  onToggleMobileSidebar: () => void
}

export default function Nav({ shoppingListCount, onOpenShoppingList, onToggleMobileSidebar }: NavProps) {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()
  const { theme, setMode } = useTheme()
  const { isSignedIn, getToken } = useAuth()

  // Acts on the currently *displayed* theme, not the abstract mode - a
  // first-time visitor's mode starts as "system" (unset), and if that
  // happens to resolve to the same theme already showing, toggling mode
  // through a 3rd "system" step made the first click look like it did
  // nothing (label changed, page didn't) and only the second click visibly
  // switched. Every click now flips light<->dark immediately.
  const themeLabel = theme === 'light' ? (lang === 'he' ? 'מצב כהה' : 'Dark mode') : (lang === 'he' ? 'מצב בהיר' : 'Light mode')
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

  return (
    <nav className="print:hidden fixed top-0 inset-x-0 z-50 bg-bg/90 backdrop-blur-md border-b border-tint/[0.06]">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button"
            onClick={onToggleMobileSidebar}
            aria-label={lang === 'he' ? 'תפריט' : 'Menu'}
            className="sm:hidden h-10 w-10 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream/90 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <button type="button"
            onClick={() => navigate('/')}
            aria-label={lang === 'he' ? 'לדף הבית' : 'Go to home'}
            className="font-serif text-base sm:text-lg font-medium text-cream/90 hover:text-cream tracking-wide transition-colors truncate min-w-0"
          >
            Tugy's Cookbook
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          <button type="button"
            onClick={onOpenShoppingList}
            className="relative h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'רשימת קניות' : 'Shopping list'}
            aria-label={lang === 'he' ? 'רשימת קניות' : 'Shopping list'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            {shoppingListCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center">
                {shoppingListCount}
              </span>
            )}
          </button>

          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Action
                label={lang === 'he' ? 'English' : 'עברית'}
                labelIcon={<span>🌐</span>}
                onClick={handleLangClick}
              />
              <UserButton.Action
                label={themeLabel}
                labelIcon={<span>{themeIcon}</span>}
                onClick={handleThemeClick}
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </nav>
  )
}
