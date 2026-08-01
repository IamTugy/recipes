import { useNavigate, useParams } from 'react-router-dom'
import { useRecipe } from '../hooks/useRecipes'
import RecipeForm from './RecipeForm'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>()
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

  return <RecipeForm existing={recipe} />
}
