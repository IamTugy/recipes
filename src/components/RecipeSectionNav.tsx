import { useEffect, useState } from 'react'
import { t } from "../i18n";

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
// sense once there's more than one section to jump between, and only on
// wide screens where there's room beside the centered content column - on
// narrower viewports it would either overlap the recipe or need its own
// collapsed/expanded state, which isn't worth the complexity for a
// nice-to-have shortcut.
export default function RecipeSectionNav({ sections, lang }: RecipeSectionNavProps) {
  const tx = t[lang]
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')

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
  }

  return (
    <nav
      aria-label={tx.quickRecipeNavigation}
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
          {/* The rail sits at the left edge for Hebrew, right edge for
              English (see the nav's own positioning below) - the tooltip
              must point the opposite way, toward the center of the page,
              or it flies off the edge of the screen instead of over the
              content. */}
          <span
            role="presentation"
            className={`pointer-events-none absolute ${lang === 'he' ? 'left-full ml-2' : 'right-full mr-2'} top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-card px-2.5 py-1.5 text-xs font-medium text-cream/80 border border-tint/10 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity`}
          >
            {s.label}
          </span>
        </button>
      ))}
    </nav>
  )
}
