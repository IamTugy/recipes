import { useSearchParams } from 'react-router-dom'
import { useRecipe } from '../hooks/useRecipes'
import RecipeForm from './RecipeForm'
import { useLanguage } from '../hooks/useLanguage'

export default function NewRecipePage() {
  const [searchParams] = useSearchParams()
  const fromSlug = searchParams.get('from') ?? undefined
  const { lang } = useLanguage()
  const { recipe, loading } = useRecipe(fromSlug)

  if (fromSlug && loading) {
    return <div className="min-h-dvh bg-bg pt-20 px-4 text-center text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</div>
  }

  return <RecipeForm duplicateFrom={fromSlug ? recipe : undefined} />
}
