import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import type { Category, Difficulty } from '../types'
import { useRecipes, useTrending } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { t } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import RecipeStrip from './RecipeStrip'
import RecipePlaceholder from './RecipePlaceholder'
import SkeletonImage from './SkeletonImage'
import TranslatedText from './TranslatedText'
import VirtualRecipeGrid, { type GridItem } from './VirtualRecipeGrid'
import RecipeFilterBar, { type SortOption } from './RecipeFilterBar'
import { DIETARY_KEYWORDS } from '../lib/filterDefinitions'
import { resizedImage } from '../lib/image'
import {
  getSharedCategories, setSharedCategories,
  getSharedDifficulties, setSharedDifficulties,
  getSharedDietary, setSharedDietary,
  getSharedKosher, setSharedKosher,
  getSharedSort, setSharedSort,
} from '../lib/sharedRecipeFilters'
import { logSearch } from '../lib/logSearch'

const categories: Category[] = ['dessert', 'salad', 'soup', 'bread', 'sauce']

function parseSet<T extends string>(param: string | null): Set<T> {
  return new Set((param ? param.split(',') : []).filter(Boolean) as T[])
}

export default function Home() {
  const navigate = useNavigate()
  const { getToken, userId } = useAuth()
  // Initial state is read from the URL once on mount (lazy initializers),
  // falling back to whatever the shared filter storage last held (synced
  // with My Cookbook), so a shared link reproduces the exact filtered view
  // and an unlinked visit picks up wherever the user left off on either
  // page. "tag" is kept as a legacy alias for "q" - old share links used
  // it before this sync existed.
  const [searchParams, setSearchParams] = useSearchParams()
  const { lang } = useLanguage()
  const tx = t[lang]
  const [search, setSearch] = useState(() => searchParams.get('q') ?? searchParams.get('tag') ?? '')
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(() =>
    searchParams.has('category') ? parseSet(searchParams.get('category')) : (getSharedCategories() as Set<Category>))
  const [activeDifficulties, setActiveDifficulties] = useState<Set<Difficulty>>(() =>
    searchParams.has('diff') ? parseSet(searchParams.get('diff')) : (getSharedDifficulties() as Set<Difficulty>))
  const [activeDietary, setActiveDietary] = useState<Set<string>>(() =>
    searchParams.has('diet') ? parseSet(searchParams.get('diet')) : getSharedDietary())
  const [activeKosher, setActiveKosher] = useState<Set<string>>(() =>
    searchParams.has('kosher') ? parseSet(searchParams.get('kosher')) : getSharedKosher())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(() => searchParams.get('fav') === '1')
  const [showMineOnly, setShowMineOnly] = useState(() => searchParams.get('mine') === '1')
  const [sortBy, setSortBy] = useState<SortOption>(() => (searchParams.get('sort') as SortOption) || (getSharedSort() as SortOption) || 'rating')
  const [groupByDish, setGroupByDish] = useState(() => searchParams.get('grouped') === '1')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => searchParams.get('group'))
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const { recipes, loading, error } = useRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { trending, loading: trendingLoading } = useTrending()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const hasOwnRecipes = !!userId && recipes.some(r => r.ownerId === userId)

  // Keep the URL in sync with every filter/search/sort change (replace, not
  // push, so typing in the search box doesn't spam browser history) - a
  // shared link always reproduces the exact filtered view.
  useEffect(() => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('q', search.trim())
    if (activeCategories.size) next.set('category', [...activeCategories].join(','))
    if (activeDifficulties.size) next.set('diff', [...activeDifficulties].join(','))
    if (activeDietary.size) next.set('diet', [...activeDietary].join(','))
    if (activeKosher.size) next.set('kosher', [...activeKosher].join(','))
    if (showFavoritesOnly) next.set('fav', '1')
    if (showMineOnly) next.set('mine', '1')
    if (sortBy !== 'rating') next.set('sort', sortBy)
    if (groupByDish) next.set('grouped', '1')
    if (activeGroupId) next.set('group', activeGroupId)
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeCategories, activeDifficulties, activeDietary, activeKosher, showFavoritesOnly, showMineOnly, sortBy, groupByDish, activeGroupId])

  // Mirror category/difficulty/dietary/kosher/sort into shared storage so
  // My Cookbook picks up the same selection.
  useEffect(() => {
    setSharedCategories(activeCategories)
    setSharedDifficulties(activeDifficulties)
    setSharedDietary(activeDietary)
    setSharedKosher(activeKosher)
    setSharedSort(sortBy)
  }, [activeCategories, activeDifficulties, activeDietary, activeKosher, sortBy])

  const hasActiveFilters = activeCategories.size > 0 || activeDifficulties.size > 0 || activeDietary.size > 0
    || activeKosher.size > 0 || showFavoritesOnly || showMineOnly || !!search.trim()

  function clearAllFilters() {
    setActiveCategories(new Set())
    setActiveDifficulties(new Set())
    setActiveDietary(new Set())
    setActiveKosher(new Set())
    setShowFavoritesOnly(false)
    setShowMineOnly(false)
    setGroupByDish(false)
    setActiveGroupId(null)
  }

  function toggleInSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

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
    if (showMineOnly) list = list.filter(r => r.ownerId === userId)
    if (activeCategories.size) list = list.filter(r => activeCategories.has(r.category))
    if (activeDifficulties.size) list = list.filter(r => activeDifficulties.has(r.difficulty))
    if (activeDietary.size) {
      list = list.filter(r => {
        const allTags = [...r.tags, ...(r.tagsEn ?? [])].map(t => t.toLowerCase())
        return [...activeDietary].some(diet => {
          const keywords = DIETARY_KEYWORDS[diet]
          return keywords && keywords.some(k => allTags.some(tag => tag.includes(k.toLowerCase())))
        })
      })
    }
    if (activeKosher.size) list = list.filter(r => r.kosherType && activeKosher.has(r.kosherType))
    if (activeGroupId) list = list.filter(r => r.dishGroupId === activeGroupId)
    let relevance: Map<string, number> | null = null
    if (search.trim()) {
      const q = search.toLowerCase()
      relevance = new Map()
      list = list.filter(r => {
        const hasIngredient = r.ingredients.some(group =>
          group.items.some(item => {
            const name = lang === 'en' ? (item.nameEn ?? item.name) : item.name
            return name.toLowerCase().includes(q)
          })
        )
        const titleMatch = lang === 'en'
          ? r.title.toLowerCase().includes(q)
          : (r.titleHe ?? r.title).toLowerCase().includes(q)
        const descriptionMatch = lang === 'en'
          ? (r.descriptionEn ?? r.description).toLowerCase().includes(q)
          : (r.description ?? '').toLowerCase().includes(q)
        const otherMatch = lang === 'en'
          ? (r.tagsEn ?? r.tags).some(t => t.toLowerCase().includes(q)) || (r.cuisine?.toLowerCase().includes(q))
          : r.tags.some(t => t.toLowerCase().includes(q)) || (r.cuisine?.toLowerCase().includes(q))

        // Recipes matching in title/description outrank ones that only
        // match via an ingredient name or tag, so "white onion soup"
        // surfaces above a recipe that merely uses white onion.
        const matches = titleMatch || descriptionMatch || otherMatch || hasIngredient
        if (matches) {
          relevance!.set(r.id, titleMatch || descriptionMatch ? 1 : 0)
        }
        return matches
      })
    }
    if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1))
    } else if (sortBy === 'quickest') {
      list = [...list].sort((a, b) => (a.prepTime + a.cookTime) - (b.prepTime + b.cookTime))
    } else if (sortBy === 'newest') {
      list = [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    }
    if (relevance) {
      const rel = relevance
      list = [...list].sort((a, b) => (rel.get(b.id) ?? 0) - (rel.get(a.id) ?? 0))
    }
    return list
  }, [search, activeCategories, activeDifficulties, activeDietary, activeKosher, lang, recipes, showFavoritesOnly, showMineOnly, userId, favoriteSlugs, sortBy, activeGroupId])

  // Whether grouping would actually collapse anything in the current
  // filtered set - the toggle to enable it only shows up when it would.
  const canGroup = useMemo(() => {
    if (activeGroupId) return false
    const counts = new Map<string, number>()
    for (const r of filtered) {
      if (!r.dishGroupId) continue
      counts.set(r.dishGroupId, (counts.get(r.dishGroupId) ?? 0) + 1)
    }
    return [...counts.values()].some(n => n >= 2)
  }, [filtered, activeGroupId])

  const gridItems = useMemo<GridItem[]>(() => {
    if (activeGroupId || !groupByDish) {
      return filtered.map(recipe => ({ type: 'recipe', recipe }) as GridItem)
    }
    const byGroup = new Map<string, typeof filtered>()
    for (const recipe of filtered) {
      if (!recipe.dishGroupId) continue
      const list = byGroup.get(recipe.dishGroupId) ?? []
      list.push(recipe)
      byGroup.set(recipe.dishGroupId, list)
    }
    const seenGroups = new Set<string>()
    const items: GridItem[] = []
    for (const recipe of filtered) {
      const members = recipe.dishGroupId ? byGroup.get(recipe.dishGroupId) : undefined
      if (members && members.length >= 2 && recipe.dishGroupId) {
        if (seenGroups.has(recipe.dishGroupId)) continue
        seenGroups.add(recipe.dishGroupId)
        items.push({
          type: 'group',
          group: {
            id: recipe.dishGroupId,
            name: recipe.dishGroupName ?? recipe.title,
            nameHe: recipe.dishGroupNameHe,
            count: members.length,
            previewRecipes: members.slice(0, 4),
          },
        })
      } else {
        items.push({ type: 'recipe', recipe })
      }
    }
    return items
  }, [filtered, groupByDish, activeGroupId])

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

      <div className="max-w-6xl mx-auto px-6">
        <RecipeFilterBar
          lang={lang}
          categories={categories}
          activeCategories={activeCategories}
          onToggleCategory={cat => toggleInSet(setActiveCategories, cat)}
          onClearCategories={() => setActiveCategories(new Set())}
          extraChips={[
            {
              key: 'favorites',
              label: <><span>♥</span> {tx.favorites}</>,
              active: showFavoritesOnly,
              onClick: () => setShowFavoritesOnly(v => !v),
            },
            ...(hasOwnRecipes ? [{
              key: 'mine',
              label: tx.mine,
              active: showMineOnly,
              onClick: () => setShowMineOnly(v => !v),
            }] : []),
          ]}
          activeDifficulties={activeDifficulties}
          onToggleDifficulty={d => toggleInSet(setActiveDifficulties, d)}
          activeDietary={activeDietary}
          onToggleDietary={d => toggleInSet(setActiveDietary, d)}
          activeKosher={activeKosher}
          onToggleKosher={k => toggleInSet(setActiveKosher, k)}
          canGroup={canGroup}
          groupByDish={groupByDish}
          onToggleGroup={() => setGroupByDish(v => !v)}
          sortBy={sortBy}
          onSortChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          resultCount={filtered.length}
          totalCount={recipes.length}
          hasActiveFilters={hasActiveFilters}
          onClearAll={clearAllFilters}
        />
      </div>

      {!loading && !hasActiveFilters && (
        <RecipeStrip title={tx.trendingThisWeek} recipes={trending} loading={trendingLoading} />
      )}

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        {activeGroupId && (() => {
          const groupRecipe = recipes.find(r => r.dishGroupId === activeGroupId)
          const name = (lang === 'he' ? groupRecipe?.dishGroupNameHe : groupRecipe?.dishGroupName) ?? groupRecipe?.dishGroupName ?? ''
          return (
            <div className="flex items-center gap-3 mb-4 text-xs text-cream/50">
              <span>{tx.showingDishGroup(name, filtered.length)}</span>
              <button type="button" onClick={() => setActiveGroupId(null)} className="text-amber hover:text-amber/80 transition-colors">
                {tx.clearGroupFilter}
              </button>
            </div>
          )
        })()}

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
        ) : viewMode === 'list' ? (
          <ul className="space-y-1.5">
            {filtered.map(r => (
              <li key={r.id}>
                <button type="button"
                  onClick={() => navigate(`/recipes/${r.id}`)}
                  className="card w-full flex items-center gap-3 p-2 text-start"
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    {r.image?.includes('assets.tugy.dev') ? (
                      <SkeletonImage src={resizedImage(r.image, 160)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <RecipePlaceholder recipe={r} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-cream truncate" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                      <TranslatedText
                        primary={lang === 'he' ? r.titleHe : r.title}
                        secondary={lang === 'he' ? r.title : r.titleHe}
                      />
                    </p>
                    <p className="text-[11px] text-cream/30">
                      {tx.categories[r.category]} · {tx.difficulty[r.difficulty]}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <VirtualRecipeGrid
            items={gridItems}
            searchQuery={search}
            favoriteSlugs={favoriteSlugs}
            onToggleFavorite={toggleFavorite}
            onSelectGroup={groupId => setActiveGroupId(groupId)}
          />
        )}
      </div>
    </div>
  )
}
