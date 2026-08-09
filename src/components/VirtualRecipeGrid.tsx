import { useCallback, useMemo, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Recipe } from '../types'
import { useGridColumns } from '../hooks/useGridColumns'
import RecipeCard from './RecipeCard'

interface VirtualRecipeGridProps {
  recipes: Recipe[]
  searchQuery: string
  favoriteSlugs: Set<string>
  onToggleFavorite: (slug: string) => void
  statusBadgeFor?: (recipe: Recipe) => { label: string; className: string } | undefined
  editableFor?: (recipe: Recipe) => boolean
}

const ROW_GAP = 16 // matches `gap-4`
const ESTIMATED_ROW_HEIGHT = 360

export default function VirtualRecipeGrid({
  recipes, searchQuery, favoriteSlugs, onToggleFavorite, statusBadgeFor, editableFor,
}: VirtualRecipeGridProps) {
  const columns = useGridColumns()
  const [parentOffset, setParentOffset] = useState(0)
  // Measured from a callback ref (not an effect) so the virtualizer's
  // scrollMargin is correct as soon as the grid mounts.
  const parentRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setParentOffset(node.offsetTop)
  }, [])

  const rows = useMemo(() => {
    const chunks: Recipe[][] = []
    for (let i = 0; i < recipes.length; i += columns) {
      chunks.push(recipes.slice(i, i + columns))
    }
    return chunks
  }, [recipes, columns])

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT + ROW_GAP,
    overscan: 3,
    scrollMargin: parentOffset,
    // Rows change size in Hebrew/English and with badges - remeasure real DOM height.
    getItemKey: i => rows[i]?.[0]?.id ?? i,
  })

  const gridColsClass = columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1'

  return (
    <div ref={parentRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(virtualRow => {
        const row = rows[virtualRow.index]
        if (!row) return null
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              paddingBottom: ROW_GAP,
            }}
          >
            <div className={`grid ${gridColsClass} gap-4`}>
              {row.map((recipe, colIndex) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  index={colIndex}
                  searchQuery={searchQuery}
                  isFavorite={favoriteSlugs.has(recipe.id)}
                  onToggleFavorite={onToggleFavorite}
                  statusBadge={statusBadgeFor?.(recipe)}
                  editable={editableFor?.(recipe)}
                  imageLoading={virtualRow.index === 0 ? 'eager' : 'lazy'}
                  imageFetchPriority={virtualRow.index === 0 && colIndex === 0 ? 'high' : 'auto'}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
