import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'

export default function Nav() {
  const navigate = useNavigate()
  const { lang, setLang } = useLanguage()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-bg/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="font-serif text-xl font-bold text-cream hover:text-amber transition-colors"
        >
          Tugy's Cookbook
        </button>
        <button
          onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-semibold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          title={lang === 'he' ? 'Switch to English' : 'עבור לעברית'}
        >
          <span className={lang === 'he' ? 'text-amber' : 'text-cream/40'}>עב</span>
          <span className="text-cream/20 mx-0.5">|</span>
          <span className={lang === 'en' ? 'text-amber' : 'text-cream/40'}>EN</span>
        </button>
      </div>
    </nav>
  )
}
