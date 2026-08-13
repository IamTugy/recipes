import { useState, type ReactNode } from 'react'
import type { Category, Difficulty } from '../types'
import { categoryEmoji, t } from '../i18n'
import { DIFFICULTY_FILTERS, DIETARY_FILTERS, KOSHER_FILTERS } from '../lib/filterDefinitions'
import FilterInfoPopover from './FilterInfoPopover'
import AppSelect from './ui/AppSelect'

export interface ExtraChip {
  key: string
  label: ReactNode
  active: boolean
  onClick: () => void
}

export type SortOption = 'rating' | 'quickest' | 'newest'

interface RecipeFilterBarProps {
  lang: 'he' | 'en'
  categories: Category[]
  activeCategories: Set<Category>
  onToggleCategory: (cat: Category) => void
  onClearCategories: () => void
  extraChips?: ExtraChip[]
  activeDifficulties: Set<Difficulty>
  onToggleDifficulty: (d: Difficulty) => void
  activeDietary: Set<string>
  onToggleDietary: (d: string) => void
  activeKosher: Set<string>
  onToggleKosher: (k: string) => void
  canGroup: boolean
  groupByDish: boolean
  onToggleGroup: () => void
  sortBy: SortOption
  onSortChange: (s: SortOption) => void
  viewMode: 'grid' | 'list'
  onViewModeChange: (v: 'grid' | 'list') => void
  resultCount: number
  totalCount: number
  hasActiveFilters: boolean
  onClearAll: () => void
}

function chipClass(active: boolean) {
  return `shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg border ${
    active ? 'text-amber bg-amber/10 border-amber/20' : 'text-cream/40 hover:text-cream/70 border-transparent'
  }`
}

function smallChipClass(active: boolean) {
  return `flex items-center gap-1 px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
    active ? 'text-amber bg-amber/10 border-amber/20' : 'text-cream/35 hover:text-cream/60 border-tint/10'
  }`
}

export default function RecipeFilterBar({
  lang, categories, activeCategories, onToggleCategory, onClearCategories, extraChips,
  activeDifficulties, onToggleDifficulty, activeDietary, onToggleDietary, activeKosher, onToggleKosher,
  canGroup, groupByDish, onToggleGroup,
  sortBy, onSortChange, viewMode, onViewModeChange,
  resultCount, totalCount, hasActiveFilters, onClearAll,
}: RecipeFilterBarProps) {
  const tx = t[lang]
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedActiveCount = activeDifficulties.size + activeDietary.size + activeKosher.size + (groupByDish ? 1 : 0)

  return (
    <>
      {/* Category filter */}
      <div className="mb-6">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button type="button"
            onClick={onClearCategories}
            className={chipClass(activeCategories.size === 0)}
          >
            {tx.categories.all}
          </button>
          {extraChips?.map(chip => (
            <button type="button"
              key={chip.key}
              onClick={chip.onClick}
              className={chipClass(chip.active)}
            >
              {chip.label}
            </button>
          ))}
          {categories.map(cat => (
            <button type="button"
              key={cat}
              onClick={() => onToggleCategory(cat)}
              className={chipClass(activeCategories.has(cat))}
            >
              <span className="text-sm">{categoryEmoji[cat]}</span>
              <span>{tx.categories[cat]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced options */}
      <div className="mb-6">
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
                    onClick={() => onToggleDifficulty(f.key as Difficulty)}
                    className={smallChipClass(activeDifficulties.has(f.key as Difficulty))}
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
                    onClick={() => onToggleDietary(f.key)}
                    className={smallChipClass(activeDietary.has(f.key))}
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
                    onClick={() => onToggleKosher(f.key)}
                    className={smallChipClass(activeKosher.has(f.key))}
                  >
                    {f.label[lang]}
                    <FilterInfoPopover text={f.tooltip[lang]} />
                  </button>
                ))}
              </div>
            </div>

            {canGroup && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cream/25 mb-1.5">
                  {tx.display}
                </p>
                <button type="button"
                  onClick={onToggleGroup}
                  className={smallChipClass(groupByDish)}
                >
                  {tx.groupSameDish}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result count / clear / sort / view mode */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-cream/25 text-xs tracking-wider shrink-0">
            {hasActiveFilters ? `${resultCount} / ${totalCount}` : `${totalCount}`}
            {' '}{tx.recipes}
          </p>
          {hasActiveFilters && (
            <button type="button"
              onClick={onClearAll}
              className="text-xs text-amber hover:text-amber/80 transition-colors shrink-0"
            >
              {tx.clearFilters}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 border border-tint/10 rounded-lg p-0.5">
            <button type="button"
              onClick={() => onViewModeChange('grid')}
              aria-label={tx.gridView}
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
              onClick={() => onViewModeChange('list')}
              aria-label={tx.listView}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-amber/10 text-amber' : 'text-cream/35 hover:text-cream/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          <AppSelect
            value={sortBy}
            onValueChange={value => onSortChange(value as SortOption)}
            triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg text-xs text-cream/60 px-2.5 py-1.5 outline-none hover:bg-tint/[0.06] transition-colors"
            options={[
              { value: 'rating', label: tx.topRated },
              { value: 'quickest', label: tx.quickest },
              { value: 'newest', label: tx.newest },
            ]}
          />
        </div>
      </div>
    </>
  )
}
