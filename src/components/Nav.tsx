import { useNavigate } from 'react-router-dom'
import { UserButton } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'

interface NavProps {
  shoppingListCount: number
  onOpenShoppingList: () => void
}

export default function Nav({ shoppingListCount, onOpenShoppingList }: NavProps) {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()
  const { theme, toggleTheme } = useTheme()

  return (
    <nav className="print:hidden fixed top-0 inset-x-0 z-50 bg-bg/90 backdrop-blur-md border-b border-tint/[0.06]">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2" dir="ltr">
        <button type="button"
          onClick={() => navigate('/')}
          aria-label={lang === 'he' ? 'לדף הבית' : 'Go to home'}
          className="font-serif text-base sm:text-lg font-medium text-cream/90 hover:text-cream tracking-wide transition-colors truncate min-w-0"
        >
          Tugy's Cookbook
        </button>

        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          {/* Theme toggle */}
          <button type="button"
            onClick={toggleTheme}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* Language toggle */}
          <button type="button"
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-10 sm:h-7 rounded-lg text-xs font-semibold tracking-widest border border-tint/10 bg-tint/[0.03] hover:bg-tint/[0.07] transition-colors"
            title={lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
          >
            <span className={lang === 'he' ? 'text-amber' : 'text-cream/35'}>עב</span>
            <span className="text-cream/15">|</span>
            <span className={lang === 'en' ? 'text-amber' : 'text-cream/35'}>EN</span>
          </button>

          {/* Shopping list */}
          <button type="button"
            onClick={onOpenShoppingList}
            className="relative h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'רשימת קניות' : 'Shopping list'}
            aria-label={lang === 'he' ? 'רשימת קניות' : 'Shopping list'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m-10 0a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {shoppingListCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center">
                {shoppingListCount}
              </span>
            )}
          </button>

          <UserButton />
        </div>
      </div>
    </nav>
  )
}
