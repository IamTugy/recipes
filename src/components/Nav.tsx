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
          {/* Create recipe */}
          <button type="button"
            onClick={() => navigate('/recipes/new')}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'מתכון חדש' : 'New Recipe'}
            aria-label={lang === 'he' ? 'מתכון חדש' : 'New Recipe'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* My Recipes */}
          <button type="button"
            onClick={() => navigate('/my-recipes')}
            className="h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'המתכונים שלי' : 'My Recipes'}
            aria-label={lang === 'he' ? 'המתכונים שלי' : 'My Recipes'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
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
                label={lang === 'he' ? 'האוספים שלי' : 'My Collections'}
                labelIcon={<span>📚</span>}
                onClick={() => navigate('/collections')}
              />
              <UserButton.Action
                label={lang === 'he' ? 'תוכנית ארוחות' : 'Meal Plan'}
                labelIcon={<span>🗓️</span>}
                onClick={() => navigate('/meal-plan')}
              />
              <UserButton.Action
                label={lang === 'he' ? 'בקשות לתכונות חדשות' : 'Feature Requests'}
                labelIcon={<span>💡</span>}
                onClick={() => navigate('/feature-requests')}
              />
              <UserButton.Action
                label={lang === 'he' ? 'שפה' : 'Language'}
                labelIcon={
                  <span className="flex items-center gap-1 text-xs font-semibold tracking-widest">
                    <span className={lang === 'he' ? 'text-amber' : 'text-cream/35'}>עב</span>
                    <span className="text-cream/15">|</span>
                    <span className={lang === 'en' ? 'text-amber' : 'text-cream/35'}>EN</span>
                  </span>
                }
                onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
              />
              <UserButton.Action
                label={mode === 'light' ? 'Switch to dark mode' : mode === 'dark' ? 'Switch to system theme' : 'Switch to light mode'}
                labelIcon={<span>{mode === 'light' ? '🌙' : mode === 'dark' ? '🖥️' : '☀️'}</span>}
                onClick={cycleTheme}
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
