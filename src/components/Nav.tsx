import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'

export default function Nav() {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()
  const { theme, toggleTheme } = useTheme()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-bg/90 backdrop-blur-md border-b border-tint/[0.06]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between" dir="ltr">
        <button
          onClick={() => navigate('/')}
          className="font-serif text-lg font-medium text-cream/90 hover:text-cream tracking-wide transition-colors"
        >
          Tugy's Cookbook
        </button>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
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
          <button
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold tracking-widest border border-tint/10 bg-tint/[0.03] hover:bg-tint/[0.07] transition-colors"
            title={lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
          >
            <span className={lang === 'he' ? 'text-amber' : 'text-cream/35'}>עב</span>
            <span className="text-cream/15">|</span>
            <span className={lang === 'en' ? 'text-amber' : 'text-cream/35'}>EN</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
