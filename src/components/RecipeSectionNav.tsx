import { useEffect, useState } from 'react'

interface Section {
  id: string
  label: string
  emoji: string
}

interface RecipeSectionNavProps {
  sections: Section[]
  lang: 'en' | 'he'
}

// Floating jump-to-section nav for the recipe page (issue #47). Only makes
// sense once there's more than one section to jump between. On xl+ screens
// there's room beside the centered content column for an always-open rail;
// below that it renders as a collapsed FAB instead, since it would
// otherwise overlap the recipe content.
export default function RecipeSectionNav({ sections, lang }: RecipeSectionNavProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const elements = sections
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    )
    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  if (sections.length < 2) return null

  function jumpTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileOpen(false)
  }

  const activeSection = sections.find(s => s.id === activeId) ?? sections[0]

  return (
    <>
      <nav
        aria-label={lang === 'he' ? 'ניווט מהיר במתכון' : 'Quick recipe navigation'}
        className={`print:hidden hidden xl:flex fixed top-1/2 -translate-y-1/2 ${lang === 'he' ? 'left-6' : 'right-6'} z-30 flex-col gap-1 card p-2`}
      >
        {sections.map(s => (
          <button
            type="button"
            key={s.id}
            onClick={() => jumpTo(s.id)}
            aria-label={s.label}
            aria-current={activeId === s.id ? 'true' : undefined}
            className={`group relative h-9 w-9 flex items-center justify-center rounded-lg text-base transition-colors ${
              activeId === s.id ? 'bg-amber/15 text-amber' : 'text-cream/40 hover:text-cream/70 hover:bg-tint/[0.06]'
            }`}
          >
            <span aria-hidden="true">{s.emoji}</span>
            <span
              role="presentation"
              className={`pointer-events-none absolute ${lang === 'he' ? 'right-full mr-2' : 'left-full ml-2'} top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-card px-2.5 py-1.5 text-xs font-medium text-cream/80 border border-tint/10 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity`}
            >
              {s.label}
            </span>
          </button>
        ))}
      </nav>

      <div className={`print:hidden xl:hidden fixed bottom-20 ${lang === 'he' ? 'left-4' : 'right-4'} z-30`}>
        {mobileOpen && (
          <nav
            aria-label={lang === 'he' ? 'ניווט מהיר במתכון' : 'Quick recipe navigation'}
            className="mb-2 flex flex-col gap-0.5 card p-1.5"
          >
            {sections.map(s => (
              <button
                type="button"
                key={s.id}
                onClick={() => jumpTo(s.id)}
                aria-current={activeId === s.id ? 'true' : undefined}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap transition-colors ${
                  activeId === s.id ? 'bg-amber/15 text-amber' : 'text-cream/60 hover:text-cream/90 hover:bg-tint/[0.06]'
                }`}
              >
                <span aria-hidden="true">{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </nav>
        )}
        <button
          type="button"
          onClick={() => setMobileOpen(open => !open)}
          aria-expanded={mobileOpen}
          aria-label={lang === 'he' ? 'ניווט מהיר במתכון' : 'Quick recipe navigation'}
          className="h-11 w-11 flex items-center justify-center rounded-full bg-card border border-tint/10 shadow-lg text-base"
        >
          <span aria-hidden="true">{mobileOpen ? '✕' : activeSection?.emoji}</span>
        </button>
      </div>
    </>
  )
}
