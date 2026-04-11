import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'

export default function Nav() {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-bg/90 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between" dir="ltr">
        <button
          onClick={() => navigate('/')}
          className="font-serif text-lg font-medium text-cream/90 hover:text-cream tracking-wide transition-colors"
        >
          Tugy's Cookbook
        </button>
        <button
          onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-widest border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
          title={lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
        >
          <span className={lang === 'he' ? 'text-amber' : 'text-cream/35'}>עב</span>
          <span className="text-cream/15">|</span>
          <span className={lang === 'en' ? 'text-amber' : 'text-cream/35'}>EN</span>
        </button>
      </div>
    </nav>
  )
}
