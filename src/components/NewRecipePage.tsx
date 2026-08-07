import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useRecipe } from '../hooks/useRecipes'
import RecipeForm from './RecipeForm'
import { useLanguage } from '../hooks/useLanguage'
import type { ImportedRecipe } from '../lib/recipeImport'

export default function NewRecipePage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const fromSlug = searchParams.get('from') ?? undefined
  const { lang } = useLanguage()
  const { recipe, loading } = useRecipe(fromSlug)
  const importedDraft = (location.state as { importedDraft?: ImportedRecipe } | null)?.importedDraft

  if (fromSlug && loading) {
    return <div className="min-h-dvh bg-bg pt-20 px-4 text-center text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</div>
  }

  if (fromSlug) {
    return <RecipeForm duplicateFrom={recipe} />
  }

  if (importedDraft) {
    return <RecipeForm importedDraft={importedDraft} />
  }

  return (
    <div className="min-h-dvh bg-bg pt-20 px-4">
      <div className="max-w-md mx-auto space-y-4 text-center">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {lang === 'he' ? 'איך תרצו להוסיף מתכון?' : 'How would you like to add a recipe?'}
        </h1>
        <button type="button" onClick={() => navigate('/recipes/generate')} className="btn-primary w-full">
          {lang === 'he' ? '🔮 חיפוש מתכון עם AI' : '🔮 Research a recipe with AI'}
        </button>
        <button type="button" onClick={() => navigate('/recipes/import')} className="btn-ghost w-full">
          {lang === 'he' ? '✨ ייבוא עם AI' : '✨ Import with AI'}
        </button>
        <button type="button" onClick={() => navigate('/recipes/new/blank')} className="btn-ghost w-full">
          {lang === 'he' ? 'התחל מדף ריק' : 'Start from scratch'}
        </button>
      </div>
    </div>
  )
}
