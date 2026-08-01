import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '../hooks/useLanguage'

interface ScrollToTopButtonProps {
  raised?: boolean
}

export default function ScrollToTopButton({ raised }: ScrollToTopButtonProps) {
  const { lang } = useLanguage()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 500)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`print:hidden fixed ${raised ? 'bottom-24' : 'bottom-6'} ${lang === 'he' ? 'left-6' : 'right-6'} z-40 w-10 h-10 rounded-full bg-card border border-tint/10 shadow-lg flex items-center justify-center text-cream/60 hover:text-amber transition-colors`}
          aria-label={lang === 'he' ? 'חזרה למעלה' : 'Back to top'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
