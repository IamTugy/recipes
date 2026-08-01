import { useMemo, useState } from 'react'
import type { Category, Difficulty } from '../types'
import { useMyRecipes } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'

const categories: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const difficulties: Difficulty[] = ['easy', 'medium', 'hard']

type StatusFilter = 'draft' | 'pending_review' | 'published' | 'rejected'
const STATUS_FILTERS: StatusFilter[] = ['draft', 'pending_review', 'published', 'rejected']

const statusLabel: Record<StatusFilter, { he: string; en: string }> = {
  draft: { he: 'טיוטה', en: 'Draft' },
  pending_review: { he: 'ממתין לאישור', en: 'Pending review' },
  published: { he: 'פורסם', en: 'Published' },
  rejected: { he: 'נדחה', en: 'Rejected' },
}

const statusClass: Record<StatusFilter, string> = {
  draft: 'bg-tint/10 text-cream/40',
  pending_review: 'bg-amber/10 text-amber',
  published: 'bg-herb/10 text-herb',
  rejected: 'bg-red-500/10 text-red-400',
}

export default function MyRecipesPage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const { recipes, loading } = useMyRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | null>(null)
  const [activeStatus, setActiveStatus] = useState<StatusFilter | null>(null)

  const filtered = useMemo(() => {
    let list = recipes
    if (activeStatus) list = list.filter(r => (r.status ?? 'published') === activeStatus)
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (activeDifficulty) list = list.filter(r => r.difficulty === activeDifficulty)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.titleHe ?? '').toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [recipes, search, activeCategory, activeDifficulty, activeStatus])

  return (
    <div className="min-h-dvh bg-bg pt-14">
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <h1 className="font-serif text-2xl font-bold text-cream mb-4">
          {lang === 'he' ? 'המתכונים שלי' : 'My Recipes'}
        </h1>
        <div className="relative max-w-md">
          <svg
            className={`absolute ${lang === 'he' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 w-4 h-4 text-cream/25`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tx.searchPlaceholder}
            aria-label={tx.searchPlaceholder}
            className={`input-field ${lang === 'he' ? 'pr-11 text-right' : 'pl-11'} w-full`}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
        </div>
      </div>

      {/* Status filter */}
      <div className="max-w-6xl mx-auto px-6 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          <button type="button"
            onClick={() => setActiveStatus(null)}
            className={`px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
              activeStatus === null
                ? 'text-amber bg-amber/10 border-amber/20'
                : 'text-cream/35 hover:text-cream/60 border-tint/10'
            }`}
          >
            {lang === 'he' ? 'הכל' : 'All'}
          </button>
          {STATUS_FILTERS.map(s => (
            <button type="button"
              key={s}
              onClick={() => setActiveStatus(s === activeStatus ? null : s)}
              className={`px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                activeStatus === s
                  ? 'text-amber bg-amber/10 border-amber/20'
                  : 'text-cream/35 hover:text-cream/60 border-tint/10'
              }`}
            >
              {statusLabel[s][lang]}
            </button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="max-w-6xl mx-auto px-6 mb-6">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button type="button"
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
              activeCategory === null
                ? 'text-amber bg-amber/10 border border-amber/20'
                : 'text-cream/40 hover:text-cream/70 border border-transparent'
            }`}
          >
            {tx.categories.all}
          </button>
          {categories.map(cat => (
            <button type="button"
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
                activeCategory === cat
                  ? 'text-amber bg-amber/10 border border-amber/20'
                  : 'text-cream/40 hover:text-cream/70 border border-transparent'
              }`}
            >
              <span className="text-sm">{categoryEmoji[cat]}</span>
              <span>{tx.categories[cat]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty filter */}
      <div className="max-w-6xl mx-auto px-6 mb-6">
        <div className="flex gap-1.5">
          {difficulties.map(diff => (
            <button type="button"
              key={diff}
              onClick={() => setActiveDifficulty(diff === activeDifficulty ? null : diff)}
              className={`px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                activeDifficulty === diff
                  ? 'text-amber bg-amber/10 border-amber/20'
                  : 'text-cream/35 hover:text-cream/60 border-tint/10'
              }`}
            >
              {tx.difficulty[diff]}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <p className="text-cream/25 text-xs tracking-wider mb-5">
          {(search || activeCategory || activeDifficulty || activeStatus)
            ? `${filtered.length} / ${recipes.length}`
            : `${recipes.length}`
          }
          {' '}{lang === 'he' ? 'מתכונים' : 'recipes'}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <RecipeCardSkeleton key={i} />)}
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">
              {lang === 'he' ? 'עדיין לא יצרתם מתכונים' : "You haven't created any recipes yet"}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">{tx.noResultsTitle}</p>
            <p className="text-xs">{tx.noResultsHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r, i) => {
              const status = (r.status ?? 'published') as StatusFilter
              return (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  index={i}
                  searchQuery={search}
                  isFavorite={favoriteSlugs.has(r.id)}
                  onToggleFavorite={toggleFavorite}
                  statusBadge={status === 'published' && r.currentRevision === r.publishedRevision
                    ? undefined
                    : { label: statusLabel[status][lang], className: statusClass[status] }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
