import { useNavigate } from 'react-router-dom'
import { UserButton, useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'
import { OWNER_USER_ID } from '../lib/admin'
import { useMyRecipes, usePendingSubmissions } from '../hooks/useRecipes'

interface NavProps {
  shoppingListCount: number
  onOpenShoppingList: () => void
}

export default function Nav({ shoppingListCount, onOpenShoppingList }: NavProps) {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()
  const { mode, cycleTheme } = useTheme()
  const { userId } = useAuth()
  const isAdmin = userId === OWNER_USER_ID
  const { recipes: pendingSubmissions } = usePendingSubmissions(isAdmin)
  const { recipes: myRecipes } = useMyRecipes(!isAdmin)
  const attentionCount = isAdmin
    ? pendingSubmissions.length
    : myRecipes.filter(r => r.status === 'rejected').length

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
          {/* New recipe */}
          <button type="button"
            onClick={() => navigate('/recipes/new')}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'מתכון חדש' : 'New recipe'}
            aria-label={lang === 'he' ? 'מתכון חדש' : 'New recipe'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Collections */}
          <button type="button"
            onClick={() => navigate('/collections')}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'האוספים שלי' : 'My collections'}
            aria-label={lang === 'he' ? 'האוספים שלי' : 'My collections'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14-7H5a2 2 0 00-2 2v14l4-2 3 2 3-2 3 2 3-2V6a2 2 0 00-2-2z" />
            </svg>
          </button>

          {/* Meal plan */}
          <button type="button"
            onClick={() => navigate('/meal-plan')}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'תוכנית ארוחות' : 'Meal plan'}
            aria-label={lang === 'he' ? 'תוכנית ארוחות' : 'Meal plan'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Theme cycle: light -> dark -> system */}
          <button type="button"
            onClick={cycleTheme}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={mode === 'light' ? 'Switch to dark mode' : mode === 'dark' ? 'Switch to system theme' : 'Switch to light mode'}
            aria-label={mode === 'light' ? 'Switch to dark mode' : mode === 'dark' ? 'Switch to system theme' : 'Switch to light mode'}
          >
            {mode === 'light' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : mode === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="2" y="4" width="20" height="13" rx="2" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8M12 17v4" />
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

          {/* Attention: pending submissions (admin) or rejected-with-feedback (owner) */}
          {attentionCount > 0 && (
            <button type="button"
              onClick={() => navigate(isAdmin ? '/admin/submissions' : '/my-recipes')}
              className="relative h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
              title={isAdmin
                ? (lang === 'he' ? 'בקשות ממתינות לאישור' : 'Submissions awaiting review')
                : (lang === 'he' ? 'מתכונים שנדחו' : 'Recipes needing your attention')}
              aria-label={isAdmin
                ? (lang === 'he' ? 'בקשות ממתינות לאישור' : 'Submissions awaiting review')
                : (lang === 'he' ? 'מתכונים שנדחו' : 'Recipes needing your attention')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center">
                {attentionCount}
              </span>
            </button>
          )}

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

          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Action
                label={lang === 'he' ? 'בקשות לתכונות חדשות' : 'Feature Requests'}
                labelIcon={<span>💡</span>}
                onClick={() => navigate('/feature-requests')}
              />
              <UserButton.Action
                label={lang === 'he' ? 'המתכונים שלי' : 'My Recipes'}
                labelIcon={<span>📖</span>}
                onClick={() => navigate('/my-recipes')}
              />
              {isAdmin && (
                <UserButton.Action
                  label={lang === 'he' ? 'תור אישורים' : 'Review Queue'}
                  labelIcon={<span>✅</span>}
                  onClick={() => navigate('/admin/submissions')}
                />
              )}
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </nav>
  )
}
