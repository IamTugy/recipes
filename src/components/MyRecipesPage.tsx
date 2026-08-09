import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Difficulty } from '../types'
import { useMyRecipes } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import RecipePlaceholder from './RecipePlaceholder'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

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

const PAGE_SIZE = 24

export default function MyRecipesPage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const navigate = useNavigate()
  const { recipes, loading } = useMyRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | null>(null)
  const [activeStatus, setActiveStatus] = useState<StatusFilter | null>(null)
  const [liveOnly, setLiveOnly] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const filtersKey = JSON.stringify([search, activeCategory, activeDifficulty, activeStatus, liveOnly])
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey)
    setVisibleCount(PAGE_SIZE)
  }

  const filtered = useMemo(() => {
    let list = recipes
    if (liveOnly) list = list.filter(r => r.publishedRevision != null)
    if (activeStatus) list = list.filter(r => (r.status ?? 'published') === activeStatus)
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (activeDifficulty) list = list.filter(r => r.difficulty === activeDifficulty)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.titleHe ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [recipes, search, activeCategory, activeDifficulty, activeStatus, liveOnly])

  const paged = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = visibleCount < filtered.length
  const sentinelRef = useInfiniteScroll(useCallback(() => {
    setVisibleCount(v => Math.min(v + PAGE_SIZE, filtered.length))
  }, [filtered.length]))

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
          <button type="button"
            onClick={() => setLiveOnly(v => !v)}
            title={lang === 'he' ? 'מתכונים שנראים כרגע לכולם באתר, גם אם יש בהם עריכה שלא פורסמה' : "Recipes currently visible to everyone on the site, even if they have an unpublished edit in progress"}
            className={`px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
              liveOnly
                ? 'text-amber bg-amber/10 border-amber/20'
                : 'text-cream/35 hover:text-cream/60 border-tint/10'
            }`}
          >
            🌐 {lang === 'he' ? 'חי באתר' : 'Live on site'}
          </button>
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
        <div className="flex items-center justify-between mb-5">
          <p className="text-cream/25 text-xs tracking-wider">
            {(search || activeCategory || activeDifficulty || activeStatus || liveOnly)
              ? `${filtered.length} / ${recipes.length}`
              : `${recipes.length}`
            }
            {' '}{lang === 'he' ? 'מתכונים' : 'recipes'}
          </p>
          <div className="flex items-center gap-1 border border-tint/10 rounded-lg p-0.5">
            <button type="button"
              onClick={() => setViewMode('grid')}
              aria-label={lang === 'he' ? 'תצוגת רשת' : 'Grid view'}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-amber/10 text-amber' : 'text-cream/35 hover:text-cream/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button type="button"
              onClick={() => setViewMode('list')}
              aria-label={lang === 'he' ? 'תצוגת רשימה' : 'List view'}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-amber/10 text-amber' : 'text-cream/35 hover:text-cream/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

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
        ) : viewMode === 'list' ? (
          <ul className="space-y-1.5">
            {paged.map(r => {
              const status = (r.status ?? 'published') as StatusFilter
              const showBadge = !(status === 'published' && r.currentRevision === r.publishedRevision)
              const displayTitle = lang === 'he' ? (r.titleHe ?? r.title) : r.title
              return (
                <li key={r.id}>
                  <button type="button"
                    onClick={() => navigate(`/recipes/${r.id}`)}
                    className="card w-full flex items-center gap-3 p-2 text-start"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                      {r.image?.includes('assets.tugy.dev') ? (
                        <img src={r.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <RecipePlaceholder recipe={r} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-cream truncate" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                        {displayTitle}
                      </p>
                      <p className="text-[11px] text-cream/30 flex items-center gap-1.5">
                        <span>{categoryEmoji[r.category]} {tx.categories[r.category]}</span>
                        <span>·</span>
                        <span>{tx.difficulty[r.difficulty]}</span>
                      </p>
                    </div>
                    {showBadge && (
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass[status]}`}>
                        {statusLabel[status][lang]}
                      </span>
                    )}
                    {status !== 'pending_review' && (
                      <button type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/recipes/${r.id}/edit`) }}
                        aria-label={lang === 'he' ? 'ערוך מתכון' : 'Edit recipe'}
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-cream/30 hover:text-cream/60 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map((r, i) => {
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
                  editable={status !== 'pending_review'}
                />
              )
            })}
          </div>
        )}

        {!loading && hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-8">
            <span className="text-xs text-cream/30 tracking-wider">
              {lang === 'he' ? 'טוען עוד...' : 'Loading more...'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
