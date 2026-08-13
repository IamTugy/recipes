import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import { t } from "../i18n";

interface NavProps {
  shoppingListCount: number
  onOpenShoppingList: () => void
  onToggleMobileSidebar: () => void
}

export default function Nav({ shoppingListCount, onOpenShoppingList, onToggleMobileSidebar }: NavProps) {
  const navigate = useNavigate()
  const { lang } = useLanguage()
        const tx = t[lang]

  return (
    <nav className="print:hidden fixed top-0 inset-x-0 z-50 bg-bg/90 backdrop-blur-md border-b border-tint/[0.06]">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button"
            onClick={onToggleMobileSidebar}
            aria-label={tx.menu}
            className="sm:hidden h-10 w-10 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream/90 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <button type="button"
            onClick={() => navigate('/')}
            aria-label={tx.goToHome}
            className="font-serif text-base sm:text-lg font-medium text-cream/90 hover:text-cream tracking-wide transition-colors truncate min-w-0"
          >
            Tugy's Cookbook
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          <button type="button"
            onClick={onOpenShoppingList}
            className="relative h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
            title={tx.shoppingList}
            aria-label={tx.shoppingList}
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
        </div>
      </div>
    </nav>
  )
}
