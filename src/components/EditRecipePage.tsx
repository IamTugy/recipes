import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useRecipe } from '../hooks/useRecipes'
import RecipeForm from './RecipeForm'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { recipe, loading } = useRecipe(id)

  if (loading) {
    return <div className="min-h-dvh bg-bg pt-20 px-4 text-center text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</div>
  }

  if (!recipe) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center pt-14">
        <div className="text-center">
          <p className="text-6xl mb-4">🍳</p>
          <p className="text-cream/60 text-lg">{tx.notFound}</p>
          <button type="button" onClick={() => navigate('/')} className="btn-primary mt-6">
            {tx.backToRecipes}
          </button>
        </div>
      </div>
    )
  }

  // Coming from the AI review's "Apply changes" button - layer the AI's
  // suggested field fixes on top of the current recipe before handing it to
  // the form, so the owner reviews/edits them rather than having them
  // silently auto-saved.
  const applySuggestions = searchParams.get('applySuggestions') === '1' && recipe.qualityReview?.suggestedFields
  const existing = applySuggestions ? { ...recipe, ...recipe.qualityReview!.suggestedFields } : recipe

  return <RecipeForm existing={existing} />
}
