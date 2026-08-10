import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { usePendingDrafts, deleteRecipe } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { ApiError } from '../lib/api'

// Shown above the recipe editor whenever more than one bulk-AI-generated
// draft is still pending review (not yet saved by the user). See the
// Global Constraints note in the implementation plan for why this is a
// horizontal strip rather than a true side column - RecipeForm's
// single-column layout doesn't have room for one without a page rewrite.
export default function AiDraftsPanel() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { id: currentId } = useParams<{ id: string }>()
  const { recipes, loading, reload } = usePendingDrafts()
  const { showToast } = useToast()

  if (loading || recipes.length <= 1) return null

  async function handleRemove(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await deleteRecipe(id, getToken)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (lang === 'he' ? 'מחיקת המתכון נכשלה' : 'Failed to delete the recipe')
      showToast(message, 'error')
      return
    }
    await reload()
    if (id !== currentId) return
    const next = recipes.find(r => r.id !== id)
    navigate(next ? `/recipes/${next.id}/edit` : '/my-recipes')
  }

  return (
    <div className="max-w-3xl mx-auto mb-4">
      <div className="card p-3 space-y-1.5">
        <p className="text-xs font-semibold text-cream/50 px-1">
          {lang === 'he' ? `מתכונים בתהליך (${recipes.length})` : `Drafts in progress (${recipes.length})`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {recipes.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/recipes/${r.id}/edit`)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                r.id === currentId ? 'bg-amber/10 text-amber' : 'text-cream/70 hover:bg-tint/5'
              }`}
            >
              <span className="max-w-[10rem] truncate">{r.title || (lang === 'he' ? 'ללא שם' : 'Untitled')}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={e => handleRemove(r.id, e)}
                className="text-cream/30 hover:text-red-400"
              >
                ✕
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
