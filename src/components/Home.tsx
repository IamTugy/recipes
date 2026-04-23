import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Category } from '../types'
import { recipes } from '../data/recipes'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import ThemeHero from './ThemeHero'
import { SakuraPetal, LeafSprig, Sparkle } from './motifs'

const categories: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']

export default function Home() {
  const { lang } = useLanguage()
  const { theme } = useTheme()
  const tx = t[lang]
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setLoaded(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const filtered = useMemo(() => {
    let list = recipes.filter(r => !r.hidden)
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        if (lang === 'en') {
          return (
            r.title.toLowerCase().includes(q) ||
            (r.descriptionEn ?? r.description).toLowerCase().includes(q) ||
            (r.tagsEn ?? r.tags).some(tag => tag.toLowerCase().includes(q)) ||
            (r.cuisine?.toLowerCase().includes(q))
          )
        }
        return (
          (r.titleHe ?? r.title).toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some(tag => tag.toLowerCase().includes(q)) ||
          (r.cuisine?.toLowerCase().includes(q))
        )
      })
    }
    return list
  }, [search, activeCategory, lang])

  const featured = useMemo(() => recipes.filter(r => !r.hidden && r.featured).slice(0, 8), [])
  const isFiltering = Boolean(search.trim() || activeCategory)

  return (
    <div className="min-h-screen bg-bg pt-16 relative overflow-x-hidden">
      {/* Ambient decor: drifting petals / leaves, theme-tinted */}
      <DecorLayer theme={theme} />

      {/* Hero */}
      <ThemeHero theme={theme} lang={lang} />

      {/* Search */}
      <div className="max-w-4xl mx-auto px-6 -mt-8 relative z-10">
        <div className="relative">
          <svg
            className={`absolute ${lang === 'he' ? 'right-5' : 'left-5'} top-1/2 -translate-y-1/2 w-5 h-5 text-accent/60 pointer-events-none`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tx.searchPlaceholder}
            className={`input-field shadow-lg ${lang === 'he' ? 'pr-14 text-right' : 'pl-14'} w-full text-base py-4`}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
        </div>
      </div>

      {/* Category tiles */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-accent">
            <LeafSprig width="16" height="24" />
          </span>
          <h2 className="font-serif text-xl text-ink/80">
            {lang === 'he' ? 'קטגוריות' : 'Categories'}
          </h2>
          <div className="flex-1 h-px bg-tint/10" />
        </div>

        <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2.5">
          <CategoryTile
            label={tx.categories.all}
            emoji="✻"
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {categories.map(cat => (
            <CategoryTile
              key={cat}
              label={tx.categories[cat]}
              emoji={categoryEmoji[cat]}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
            />
          ))}
        </div>
      </div>

      {/* Featured strip */}
      {!isFiltering && featured.length > 0 && (
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-4">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-highlight">
              <Sparkle width="18" height="18" />
            </span>
            <h2 className="font-serif text-xl text-ink/80">{tx.featured}</h2>
            <div className="flex-1 h-px bg-tint/10" />
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-6 px-6">
            {featured.map((r, i) => (
              <div key={r.id} className="shrink-0 w-72">
                <RecipeCard recipe={r} index={i} searchQuery="" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-24">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-accent-soft">
            <LeafSprig width="16" height="24" />
          </span>
          <h2 className="font-serif text-xl text-ink/80">
            {lang === 'he' ? 'כל המתכונים' : 'All recipes'}
          </h2>
          <span className="smallcaps text-ink/35 text-[10px]">
            {isFiltering ? `${filtered.length} / ${recipes.length}` : `${recipes.length}`}
          </span>
          <div className="flex-1 h-px bg-tint/10" />
        </div>

        {!loaded ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-ink/30">
            <p className="text-sm tracking-widest uppercase mb-2">{tx.noResultsTitle}</p>
            <p className="text-xs">{tx.noResultsHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((r, i) => (
              <RecipeCard key={r.id} recipe={r} index={i} searchQuery={search} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CategoryTile({
  label, emoji, active, onClick,
}: { label: string; emoji: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 p-2 transition-all border ${
        active
          ? 'bg-accent text-card border-accent shadow-lg shadow-accent/30'
          : 'bg-card border-tint/10 hover:border-accent/40 hover:-translate-y-0.5'
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className={`text-[10px] font-medium tracking-wide text-center leading-tight ${active ? 'text-card' : 'text-ink/70'}`}>
        {label}
      </span>
    </motion.button>
  )
}

function DecorLayer({ theme }: { theme: 'matcha' | 'ramen' | 'sakura' }) {
  if (theme === 'sakura') {
    return (
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-accent/45 animate-petal"
            style={{
              left: `${(i * 13 + 5) % 100}%`,
              top: `-20px`,
              animationDelay: `${i * 2.1}s`,
              animationDuration: `${14 + (i % 4) * 2}s`,
            }}
          >
            <SakuraPetal width={14 + (i % 3) * 4} height={14 + (i % 3) * 4} />
          </span>
        ))}
      </div>
    )
  }
  return null
}
