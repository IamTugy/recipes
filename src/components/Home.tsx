import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Difficulty } from '../types'
import { useRecipes, useTrending } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import RecipeStrip from './RecipeStrip'

const categories: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const difficulties: Difficulty[] = ['easy', 'medium', 'hard']

type SortOption = 'default' | 'rating' | 'quickest'

export default function Home() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { lang } = useLanguage()
  const tx = t[lang]
  const [search, setSearch] = useState(() => searchParams.get('tag') ?? '')

  // Consume the ?tag= param once on load (clicking a tag elsewhere seeds the search box)
  useEffect(() => {
    if (searchParams.get('tag')) {
      setSearchParams({}, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | null>(null)
  const { recipes, loading, error } = useRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('default')
  const { recentIds } = useRecentlyViewed()
  const { trending } = useTrending()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // "/" focuses search (from anywhere on the page), Escape clears + blurs it
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Escape' && target === searchInputRef.current) {
        setSearch('')
        searchInputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const recentRecipes = useMemo(
    () => recentIds.map(id => recipes.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r),
    [recentIds, recipes],
  )

  const filtered = useMemo(() => {
    let list = recipes.filter(r => !r.hidden)
    if (showFavoritesOnly) list = list.filter(r => favoriteSlugs.has(r.id))
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (activeDifficulty) list = list.filter(r => r.difficulty === activeDifficulty)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        if (lang === 'en') {
          return (
            r.title.toLowerCase().includes(q) ||
            (r.descriptionEn ?? r.description).toLowerCase().includes(q) ||
            (r.tagsEn ?? r.tags).some(t => t.toLowerCase().includes(q)) ||
            (r.cuisine?.toLowerCase().includes(q))
          )
        }
        return (
          (r.titleHe ?? r.title).toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q)) ||
          (r.cuisine?.toLowerCase().includes(q))
        )
      })
    }
    if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1))
    } else if (sortBy === 'quickest') {
      list = [...list].sort((a, b) => (a.prepTime + a.cookTime) - (b.prepTime + b.cookTime))
    }
    return list
  }, [search, activeCategory, activeDifficulty, lang, recipes, showFavoritesOnly, favoriteSlugs, sortBy])

  function surpriseMe() {
    if (filtered.length === 0) return
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    navigate(`/recipe/${pick.id}`)
  }

  return (
    <div className="min-h-screen bg-bg pt-14">

      {/* Search + categories */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative max-w-md flex-1">
            <svg
              className={`absolute ${lang === 'he' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 w-4 h-4 text-cream/25`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tx.searchPlaceholder}
              className={`input-field ${lang === 'he' ? 'pr-11 text-right' : 'pl-11'} w-full`}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            />
            {!search && (
              <kbd className={`hidden sm:flex absolute ${lang === 'he' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 items-center justify-center w-5 h-5 rounded text-[10px] font-mono text-cream/25 border border-tint/10 bg-tint/[0.03]`}>
                /
              </kbd>
            )}
          </div>
          <button
            onClick={surpriseMe}
            disabled={filtered.length === 0}
            className="shrink-0 flex items-center gap-1.5 px-4 h-11 rounded-lg text-xs font-semibold tracking-wide border border-tint/10 bg-tint/[0.03] hover:bg-tint/[0.07] text-cream/60 hover:text-cream/90 transition-colors disabled:opacity-30"
            title={lang === 'he' ? 'הפתע אותי' : 'Surprise me'}
          >
            <span className="text-base">🎲</span>
            <span className="hidden sm:inline">{lang === 'he' ? 'הפתע אותי' : 'Surprise me'}</span>
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="max-w-6xl mx-auto px-6 mb-6">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
              activeCategory === null
                ? 'text-amber bg-amber/10 border border-amber/20'
                : 'text-cream/40 hover:text-cream/70 border border-transparent'
            }`}
          >
            {tx.categories.all}
          </button>
          <button
            onClick={() => setShowFavoritesOnly(v => !v)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
              showFavoritesOnly
                ? 'text-amber bg-amber/10 border border-amber/20'
                : 'text-cream/40 hover:text-cream/70 border border-transparent'
            }`}
          >
            <span>♥</span>
            <span>{lang === 'he' ? 'מועדפים' : 'Favorites'}</span>
          </button>
          {categories.map(cat => (
            <button
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
            <button
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

      {!loading && !search && !activeCategory && !activeDifficulty && !showFavoritesOnly && (
        <>
          <RecipeStrip title={lang === 'he' ? '🔥 פופולרי השבוע' : '🔥 Trending this week'} recipes={trending} />
          <RecipeStrip title={lang === 'he' ? 'נצפו לאחרונה' : 'Recently viewed'} recipes={recentRecipes} />
        </>
      )}

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="flex items-center justify-between mb-5">
          <p className="text-cream/25 text-xs tracking-wider">
            {(search || activeCategory || activeDifficulty || showFavoritesOnly)
              ? `${filtered.length} / ${recipes.length}`
              : `${recipes.length}`
            }
            {' '}{lang === 'he' ? 'מתכונים' : 'recipes'}
          </p>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="bg-tint/[0.03] border border-tint/10 rounded-lg text-xs text-cream/60 px-2.5 py-1.5 outline-none hover:bg-tint/[0.06] transition-colors"
          >
            <option value="default">{lang === 'he' ? 'ברירת מחדל' : 'Default order'}</option>
            <option value="rating">{lang === 'he' ? 'דירוג גבוה' : 'Top rated'}</option>
            <option value="quickest">{lang === 'he' ? 'הכי מהיר' : 'Quickest'}</option>
          </select>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <RecipeCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">
              {lang === 'he' ? 'שגיאה בטעינת המתכונים' : 'Failed to load recipes'}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">{tx.noResultsTitle}</p>
            <p className="text-xs">{tx.noResultsHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r, i) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                index={i}
                searchQuery={search}
                isFavorite={favoriteSlugs.has(r.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
