import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import type { Category, Difficulty } from '../types'
import { useRecipes, useTrending } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import RecipeStrip from './RecipeStrip'
import AppSelect from './ui/AppSelect'
import VirtualRecipeGrid from './VirtualRecipeGrid'
import FilterInfoPopover from './FilterInfoPopover'
import { DIFFICULTY_FILTERS, DIETARY_FILTERS, KOSHER_FILTERS } from '../lib/filterDefinitions'
import { logSearch } from '../lib/logSearch'

const categories: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']

const dietaryKeywords: Record<string, string[]> = {
  vegetarian: ['vegetarian', 'צמחוני'],
  vegan: ['vegan', 'טבעוני'],
  'gluten-free': ['gluten-free', 'gluten free', 'ללא גלוטן'],
  'dairy-free': ['dairy-free', 'dairy free', 'ללא חלב', 'ללא מוצרי חלב'],
}

type SortOption = 'default' | 'rating' | 'quickest' | 'newest'

export default function Home() {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  // Initial state is read from the URL once on mount (lazy initializers) so
  // a shared link reproduces the exact filtered view. "tag" is kept as a
  // legacy alias for "q" - old share links used it before this sync existed.
  const [searchParams, setSearchParams] = useSearchParams()
  const { lang } = useLanguage()
  const tx = t[lang]
  const [search, setSearch] = useState(() => searchParams.get('q') ?? searchParams.get('tag') ?? '')
  const [activeCategory, setActiveCategory] = useState<Category | null>(() => (searchParams.get('category') as Category) || null)
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | null>(() => (searchParams.get('diff') as Difficulty) || null)
  const [activeDietary, setActiveDietary] = useState<string | null>(() => searchParams.get('diet') || null)
  const [activeKosher, setActiveKosher] = useState<string | null>(() => searchParams.get('kosher') || null)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(() => searchParams.get('fav') === '1')
  const [sortBy, setSortBy] = useState<SortOption>(() => (searchParams.get('sort') as SortOption) || 'default')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { recipes, loading, error } = useRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { trending, loading: trendingLoading } = useTrending()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Keep the URL in sync with every filter/search/sort change (replace, not
  // push, so typing in the search box doesn't spam browser history) - a
  // shared link always reproduces the exact filtered view.
  useEffect(() => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('q', search.trim())
    if (activeCategory) next.set('category', activeCategory)
    if (activeDifficulty) next.set('diff', activeDifficulty)
    if (activeDietary) next.set('diet', activeDietary)
    if (activeKosher) next.set('kosher', activeKosher)
    if (showFavoritesOnly) next.set('fav', '1')
    if (sortBy !== 'default') next.set('sort', sortBy)
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeCategory, activeDifficulty, activeDietary, activeKosher, showFavoritesOnly, sortBy])

  const advancedActiveCount = [activeDifficulty, activeDietary, activeKosher].filter(Boolean).length

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


  const filtered = useMemo(() => {
    let list = recipes.filter(r => !r.hidden)
    if (showFavoritesOnly) list = list.filter(r => favoriteSlugs.has(r.id))
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (activeDifficulty) list = list.filter(r => r.difficulty === activeDifficulty)
    if (activeDietary) {
      const keywords = dietaryKeywords[activeDietary]
      if (keywords) {
        list = list.filter(r => {
          const allTags = [...r.tags, ...(r.tagsEn ?? [])].map(t => t.toLowerCase())
          return keywords.some(k => allTags.some(tag => tag.includes(k.toLowerCase())))
        })
      }
    }
    if (activeKosher) list = list.filter(r => r.kosherType === activeKosher)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        const hasIngredient = r.ingredients.some(group =>
          group.items.some(item => {
            const name = lang === 'en' ? (item.nameEn ?? item.name) : item.name
            return name.toLowerCase().includes(q)
          })
        )
        if (lang === 'en') {
          return (
            r.title.toLowerCase().includes(q) ||
            (r.descriptionEn ?? r.description).toLowerCase().includes(q) ||
            (r.tagsEn ?? r.tags).some(t => t.toLowerCase().includes(q)) ||
            (r.cuisine?.toLowerCase().includes(q)) ||
            hasIngredient
          )
        }
        return (
          (r.titleHe ?? r.title).toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q)) ||
          (r.cuisine?.toLowerCase().includes(q)) ||
          hasIngredient
        )
      })
    }
    if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1))
    } else if (sortBy === 'quickest') {
      list = [...list].sort((a, b) => (a.prepTime + a.cookTime) - (b.prepTime + b.cookTime))
    } else if (sortBy === 'newest') {
      list = [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    }
    return list
  }, [search, activeCategory, activeDifficulty, activeDietary, activeKosher, lang, recipes, showFavoritesOnly, favoriteSlugs, sortBy])

  // Debounced search-event log: fires 1s after the user stops typing a
  // non-empty query, reading the *current* result count via a ref so
  // unrelated filter changes (category, sort, etc.) don't reset the debounce
  // timer or cause extra log calls - only changes to the search text do.
  const filteredCountRef = useRef(filtered.length)
  filteredCountRef.current = filtered.length

  // Suppresses two false-positive logs: (1) the initial mount, where `search`
  // may already be non-empty because it was seeded from the URL (?q=/&tag=)
  // rather than typed by the user, and (2) while `recipes` are still loading,
  // where resultsCount would read as 0 regardless of whether the query
  // actually matches once data arrives.
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    const trimmed = search.trim()
    if (!trimmed || loading) return
    const timer = setTimeout(() => {
      logSearch(trimmed, filteredCountRef.current, getToken)
    }, 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function surpriseMe() {
    if (filtered.length === 0) return
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    navigate(`/recipes/${pick.id}`)
  }

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-14">

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
              aria-label={tx.searchPlaceholder}
              className={`input-field ${lang === 'he' ? 'pr-11 text-right' : 'pl-11'} w-full`}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            />
            {!search && (
              <kbd className={`hidden sm:flex absolute ${lang === 'he' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 items-center justify-center w-5 h-5 rounded text-[10px] font-mono text-cream/25 border border-tint/10 bg-tint/[0.03]`}>
                /
              </kbd>
            )}
          </div>
          <button type="button"
            onClick={surpriseMe}
            disabled={filtered.length === 0}
            className="shrink-0 flex items-center gap-1.5 px-4 h-11 rounded-lg text-xs font-semibold tracking-wide border border-tint/10 bg-tint/[0.03] hover:bg-tint/[0.07] text-cream/60 hover:text-cream/90 transition-colors disabled:opacity-30"
            title={tx.surpriseMe}
          >
            <span className="text-base">🎲</span>
            <span className="hidden sm:inline">{tx.surpriseMe}</span>
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
          <button type="button"
            onClick={() => setShowFavoritesOnly(v => !v)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
              showFavoritesOnly
                ? 'text-amber bg-amber/10 border border-amber/20'
                : 'text-cream/40 hover:text-cream/70 border border-transparent'
            }`}
          >
            <span>♥</span>
            <span>{tx.favorites}</span>
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

      {/* Advanced filters */}
      <div className="max-w-6xl mx-auto px-6 mb-6">
        <button
          type="button"
          onClick={() => setAdvancedOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-cream/40 hover:text-cream/70 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? 'rotate-90' : lang === 'he' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span>{tx.advancedFilters}</span>
          {advancedActiveCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber/10 text-amber">
              {advancedActiveCount}
            </span>
          )}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/25 mb-1.5">
                {tx.difficulty2}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {DIFFICULTY_FILTERS.map(f => (
                  <button type="button"
                    key={f.key}
                    onClick={() => setActiveDifficulty(f.key === activeDifficulty ? null : f.key as Difficulty)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                      activeDifficulty === f.key
                        ? 'text-amber bg-amber/10 border-amber/20'
                        : 'text-cream/35 hover:text-cream/60 border-tint/10'
                    }`}
                  >
                    {f.label[lang]}
                    <FilterInfoPopover text={f.tooltip[lang]} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/25 mb-1.5">
                {tx.dietary}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {DIETARY_FILTERS.map(f => (
                  <button type="button"
                    key={f.key}
                    onClick={() => setActiveDietary(f.key === activeDietary ? null : f.key)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                      activeDietary === f.key
                        ? 'text-amber bg-amber/10 border-amber/20'
                        : 'text-cream/35 hover:text-cream/60 border-tint/10'
                    }`}
                  >
                    {f.label[lang]}
                    <FilterInfoPopover text={f.tooltip[lang]} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/25 mb-1.5">
                {tx.kosher}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {KOSHER_FILTERS.map(f => (
                  <button type="button"
                    key={f.key}
                    onClick={() => setActiveKosher(f.key === activeKosher ? null : f.key)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                      activeKosher === f.key
                        ? 'text-amber bg-amber/10 border-amber/20'
                        : 'text-cream/35 hover:text-cream/60 border-tint/10'
                    }`}
                  >
                    {f.label[lang]}
                    <FilterInfoPopover text={f.tooltip[lang]} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!loading && !search && !activeCategory && !activeDifficulty && !activeDietary && !activeKosher && !showFavoritesOnly && (
        <>
          <RecipeStrip title={tx.trendingThisWeek} recipes={trending} loading={trendingLoading} />
        </>
      )}

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="flex items-center justify-between mb-5">
          <p className="text-cream/25 text-xs tracking-wider">
            {(search || activeCategory || activeDifficulty || activeDietary || activeKosher || showFavoritesOnly)
              ? `${filtered.length} / ${recipes.length}`
              : `${recipes.length}`
            }
            {' '}{tx.recipes}
          </p>
          <AppSelect
            value={sortBy}
            onValueChange={value => setSortBy(value as SortOption)}
            triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg text-xs text-cream/60 px-2.5 py-1.5 outline-none hover:bg-tint/[0.06] transition-colors"
            options={[
              { value: 'default', label: tx.defaultOrder },
              { value: 'rating', label: tx.topRated },
              { value: 'quickest', label: tx.quickest },
              { value: 'newest', label: tx.newest },
            ]}
          />
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
              {tx.failedToLoadRecipes}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">{tx.noResultsTitle}</p>
            <p className="text-xs mb-5">{tx.noResultsHint}</p>
            {search.trim() && (
              <button
                type="button"
                onClick={() => navigate('/recipes/generate', { state: { query: search.trim() } })}
                className="btn-primary text-sm"
              >
                {tx.researchOnTheWebWithAI(search.trim())}
              </button>
            )}
          </div>
        ) : (
          <VirtualRecipeGrid
            recipes={filtered}
            searchQuery={search}
            favoriteSlugs={favoriteSlugs}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </div>
    </div>
  )
}
