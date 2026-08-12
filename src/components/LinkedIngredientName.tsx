import { Link } from 'react-router-dom'
import { useRecipe } from '../hooks/useRecipes'
import { t } from '../i18n'
import type { Lang } from '../types'

interface LinkedIngredientNameProps {
  recipeId: string
  lang: Lang
}

// The read-only counterpart to LinkedIngredientDisplay (which is the editor's
// version, with an unlink action) - shown in place of the plain name/nameEn
// text on the actual recipe view when an ingredient links to another recipe
// instead of having a free-text name.
export default function LinkedIngredientName({ recipeId, lang }: LinkedIngredientNameProps) {
  const tx = t[lang]
  const { recipe, loading } = useRecipe(recipeId)

  if (loading) return <span className="text-cream/40">...</span>
  if (!recipe) return <span className="text-cream/40">{tx.recipeNotFound}</span>

  return (
    <Link
      to={`/recipes/${recipeId}`}
      onClick={e => e.stopPropagation()}
      className="underline decoration-dotted underline-offset-2 hover:text-amber transition-colors"
    >
      {lang === 'he' ? (recipe.titleHe || recipe.title) : recipe.title}
    </Link>
  )
}
