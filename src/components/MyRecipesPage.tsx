import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import type { Category, Difficulty } from '../types'
import { useMyRecipes, useDuplicateDisputes } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { useJobs } from '../hooks/useJobs'
import { OWNER_USER_ID } from '../lib/admin'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import RecipePlaceholder from './RecipePlaceholder'
import SubmissionsPage from './SubmissionsPage'
import JobsPage from './JobsPage'
import RecipeFilterBar, { type SortOption } from './RecipeFilterBar'
import { DIETARY_KEYWORDS } from '../lib/filterDefinitions'
import {
  getSharedCategories, setSharedCategories,
  getSharedDifficulties, setSharedDifficulties,
  getSharedDietary, setSharedDietary,
  getSharedKosher, setSharedKosher,
  getSharedSort, setSharedSort,
} from '../lib/sharedRecipeFilters'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { resizedImage } from '../lib/image'
import TranslatedText from './TranslatedText'
import SkeletonImage from './SkeletonImage'

type PageTab = 'recipes' | 'submissions' | 'jobs'

// Kept in sync with Home.tsx's category list (see #5/#1 of the filter-sync
// request) - breakfast/lunch/dinner/snack were dropped as not useful chips.
const categories: Category[] = ['dessert', 'salad', 'soup', 'bread', 'sauce']

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
  const [searchParams, setSearchParams] = useSearchParams()
  const { userId } = useAuth()
  const isOwner = userId === OWNER_USER_ID
  const activeTab = (searchParams.get('tab') as PageTab) || 'recipes'
  function setActiveTab(next: PageTab) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (next === 'recipes') params.delete('tab')
      else params.set('tab', next)
      return params
    }, { replace: true })
  }
  const { recipes, loading } = useMyRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  // Only fetched for their badge counts here - each tab's own component
  // fetches (and polls) the same data again to actually render itself.
  const { recipes: disputes } = useDuplicateDisputes(isOwner)
  const { jobs } = useJobs()
  const jobsNeedingAttention = jobs.filter(j => j.status === 'running' || j.status === 'queued' || j.status === 'failed').length
  const [search, setSearch] = useState('')
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(() => getSharedCategories() as Set<Category>)
  const [activeDifficulties, setActiveDifficulties] = useState<Set<Difficulty>>(() => getSharedDifficulties() as Set<Difficulty>)
  const [activeDietary, setActiveDietary] = useState<Set<string>>(() => getSharedDietary())
  const [activeKosher, setActiveKosher] = useState<Set<string>>(() => getSharedKosher())
  const [activeStatus, setActiveStatus] = useState<StatusFilter | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>(() => (getSharedSort() as SortOption) || 'rating')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const filtersKey = JSON.stringify([search, [...activeCategories], [...activeDifficulties], [...activeDietary], [...activeKosher], activeStatus, sortBy])
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey)
    setVisibleCount(PAGE_SIZE)
  }

  useEffect(() => {
    setSharedCategories(activeCategories)
    setSharedDifficulties(activeDifficulties)
    setSharedDietary(activeDietary)
    setSharedKosher(activeKosher)
    setSharedSort(sortBy)
  }, [activeCategories, activeDifficulties, activeDietary, activeKosher, sortBy])

  function toggleInSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const hasActiveFilters = !!search || activeCategories.size > 0 || activeDifficulties.size > 0
    || activeDietary.size > 0 || activeKosher.size > 0 || !!activeStatus

  function clearAllFilters() {
    setActiveCategories(new Set())
    setActiveDifficulties(new Set())
    setActiveDietary(new Set())
    setActiveKosher(new Set())
    setActiveStatus(null)
  }

  const filtered = useMemo(() => {
    let list = recipes
    if (activeStatus) list = list.filter(r => (r.status ?? 'published') === activeStatus)
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
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.titleHe ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q)
      )
    }
    if (sortBy === 'rating') {
      list = [...list].sort((a, b) => (b.averageRating ?? -1) - (a.averageRating ?? -1))
    } else if (sortBy === 'quickest') {
      list = [...list].sort((a, b) => (a.prepTime + a.cookTime) - (b.prepTime + b.cookTime))
    } else if (sortBy === 'newest') {
      list = [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    }
    return list
  }, [recipes, search, activeCategories, activeDifficulties, activeDietary, activeKosher, activeStatus, sortBy])

  const paged = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = visibleCount < filtered.length
  const sentinelRef = useInfiniteScroll(useCallback(() => {
    setVisibleCount(v => Math.min(v + PAGE_SIZE, filtered.length))
  }, [filtered.length]))

  const submissionsBadge = isOwner && disputes.length > 0 ? disputes.length : undefined
  const tabs: { key: PageTab; label: string; badge?: number }[] = [
    { key: 'recipes', label: tx.recipes2 },
    { key: 'submissions', label: tx.submissions, badge: submissionsBadge },
    { key: 'jobs', label: tx.jobs, badge: jobsNeedingAttention || undefined },
  ]

  return (
    <div className="min-h-dvh bg-bg pt-14">
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-3">
        <h1 className="font-serif text-2xl font-bold text-cream mb-4">
          {tx.myRecipes}
        </h1>

        <div className="flex gap-1.5 mb-3">
          {tabs.map(tabDef => (
            <button type="button"
              key={tabDef.key}
              onClick={() => setActiveTab(tabDef.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold tracking-wide rounded-full border transition-colors ${
                activeTab === tabDef.key
                  ? 'text-amber bg-amber/10 border-amber/20'
                  : 'text-cream/50 hover:text-cream/80 border-tint/10'
              }`}
            >
              {tabDef.label}
              {!!tabDef.badge && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center">
                  {tabDef.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'submissions' && (
          <p className="text-sm text-cream/40 mb-3 max-w-2xl mx-auto">
            {tx.recentAIQualityReviewOutcomesAcross}
          </p>
        )}
        {activeTab === 'jobs' && (
          <p className="text-sm text-cream/40 mb-3 max-w-2xl mx-auto">
            {tx.jobsDescription}
          </p>
        )}

        {activeTab === 'recipes' && (
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
        )}
      </div>

      {activeTab === 'submissions' ? (
        <div className="px-4 pb-16">
          <SubmissionsPage />
        </div>
      ) : activeTab === 'jobs' ? (
        <div className="px-4 pb-16">
          <JobsPage />
        </div>
      ) : (
      <>
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
            {tx.all}
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

      <div className="max-w-6xl mx-auto px-6">
        <RecipeFilterBar
          lang={lang}
          categories={categories}
          activeCategories={activeCategories}
          onToggleCategory={cat => toggleInSet(setActiveCategories, cat)}
          onClearCategories={() => setActiveCategories(new Set())}
          activeDifficulties={activeDifficulties}
          onToggleDifficulty={d => toggleInSet(setActiveDifficulties, d)}
          activeDietary={activeDietary}
          onToggleDietary={d => toggleInSet(setActiveDietary, d)}
          activeKosher={activeKosher}
          onToggleKosher={k => toggleInSet(setActiveKosher, k)}
          canGroup={false}
          groupByDish={false}
          onToggleGroup={() => {}}
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

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <RecipeCardSkeleton key={i} />)}
          </div>
        ) : recipes.length === 0 ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">
              {tx.youHavenTCreatedAnyRecipes}
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
              return (
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
                        aria-label={tx.editRecipe}
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
          <div ref={sentinelRef} className="py-4">
            {viewMode === 'list' ? (
              <ul className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="card w-full flex items-center gap-3 p-2 animate-pulse">
                    <div className="w-12 h-12 rounded-lg bg-tint/[0.06] shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3.5 bg-tint/[0.06] rounded-md w-2/3" />
                      <div className="h-2.5 bg-tint/[0.04] rounded-md w-1/3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <RecipeCardSkeleton key={i} />)}
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
