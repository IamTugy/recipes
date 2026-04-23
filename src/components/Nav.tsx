import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import { ThemeIcon, RiceBowl } from './motifs'

const THEME_LABEL: Record<'matcha' | 'ramen' | 'sakura', string> = {
  matcha: 'Matcha',
  ramen: 'Ramen',
  sakura: 'Sakura',
}

export default function Nav() {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()
  const { theme, cycleTheme } = useTheme()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-bg/85 backdrop-blur-lg border-b border-tint/[0.06]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between" dir="ltr">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 group"
        >
          <span className="text-accent w-7 h-7 inline-flex">
            <RiceBowl width="28" height="28" />
          </span>
          <span className="font-serif text-xl font-medium text-ink/90 group-hover:text-ink tracking-wide transition-colors">
            Tugy's Cookbook
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={cycleTheme}
            className="h-9 px-3 flex items-center gap-2 rounded-full text-ink/65 hover:text-accent border border-tint/10 hover:border-accent/40 bg-card/60 transition-all"
            title={`Theme: ${THEME_LABEL[theme]} — click to cycle`}
          >
            <span className="text-accent w-5 h-5 inline-flex">
              <ThemeIcon theme={theme} width="20" height="20" />
            </span>
            <span className="smallcaps text-[10px]">{THEME_LABEL[theme]}</span>
          </button>

          <button
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold tracking-widest border border-tint/10 bg-card/60 hover:border-accent/40 transition-all"
            title={lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
          >
            <span className={lang === 'he' ? 'text-accent' : 'text-ink/35'}>עב</span>
            <span className="text-ink/20">|</span>
            <span className={lang === 'en' ? 'text-accent' : 'text-ink/35'}>EN</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
