import { useRecipe } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'

interface LinkedIngredientDisplayProps {
  recipeId: string
  onUnlink: () => void
}

// Replaces the free-text name/nameEn inputs for an ingredient that links to
// another recipe instead - fetches that recipe just to show its title
// (useRecipe already exists and handles auth/loading), not for any other
// purpose.
export default function LinkedIngredientDisplay({ recipeId, onUnlink }: LinkedIngredientDisplayProps) {
  const { lang } = useLanguage()
  const { recipe, loading } = useRecipe(recipeId)

  return (
    <div className="flex items-center gap-2 bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm">
      <svg className="w-3.5 h-3.5 text-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
      </svg>
      <span className="flex-1 min-w-0 truncate text-cream/80">
        {loading
          ? '...'
          : recipe
            ? (lang === 'he' ? (recipe.titleHe || recipe.title) : recipe.title)
            : (lang === 'he' ? 'מתכון לא נמצא' : 'Recipe not found')}
      </span>
      <button type="button" onClick={onUnlink} className="shrink-0 text-cream/30 hover:text-red-400 text-xs">
        {lang === 'he' ? 'בטל קישור' : 'Unlink'}
      </button>
    </div>
  )
}
