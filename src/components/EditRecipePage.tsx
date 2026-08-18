import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
    return <div className="min-h-dvh bg-bg pt-20 px-4 text-center text-cream/30 text-sm">{tx.loading}</div>
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

  // Coming from the AI review's "Submit" button - the owner picked specific
  // findings to apply via checkboxes, passed here as ?findings=0,2,5 (array
  // indices into recipe.qualityReview.findings). Layer only THOSE findings'
  // suggestedFix onto the current recipe before handing it to the form, so
  // the owner reviews/edits them rather than having them silently auto-saved.
  const findingsParam = searchParams.get('findings')
  const appliedFindingIndices = searchParams.get('applySuggestions') === '1' && findingsParam
    ? findingsParam.split(',').map(Number).filter(n => Number.isInteger(n) && n >= 0)
    : undefined
  const appliedFixes = appliedFindingIndices?.reduce<Record<string, unknown>>((acc, i) => {
    const fix = recipe.qualityReview?.findings[i]?.suggestedFix
    return fix ? { ...acc, ...fix } : acc
  }, {}) ?? {}
  const existing = appliedFindingIndices ? { ...recipe, ...appliedFixes } : recipe

  // Shown regardless of how the editor was reached (not just right after
  // "Submit") so the owner can see what the last AI review flagged while
  // they're actually fixing it, not only on the read-only recipe page.
  const reviewFindings = recipe.qualityReview?.findings

  // Coming from a finding's "go to location" button on the recipe page -
  // scroll to and highlight that specific field as soon as the form mounts.
  const scrollToFieldOnMount = searchParams.get('field') ?? undefined

  // Mutually exclusive - approving a dispute resets status away from
  // 'rejected', so only one of these ever shows at once. Rendered above
  // RecipeForm's own pt-20 section rather than inside it, since RecipeForm
  // is shared with the blank-draft flow that has nothing to show here.
  const duplicateBanner = recipe.status === 'rejected' && recipe.duplicateReview?.isDuplicate ? (
    <div className="card p-4 mb-4 border border-red-400/20">
      <p className="text-sm font-semibold text-cream mb-1">{tx.duplicateBlockedTitle}</p>
      <p className="text-xs text-cream/60 mb-3">{tx.duplicateBlockedIntro(recipe.duplicateReview.matchedRecipeTitle)}</p>
      <div className="flex items-center gap-3">
        <Link to={`/recipes/${recipe.duplicateReview.matchedRecipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors">
          {tx.viewSimilarRecipe}
        </Link>
        <Link to={`/recipes/${recipe.id}`} className="text-xs text-cream/40 hover:text-cream/70 transition-colors">
          {tx.manageDisputeOnRecipePage}
        </Link>
      </div>
    </div>
  ) : recipe.duplicateReview?.isDuplicate && recipe.disputeStatus === 'approved' ? (
    <div className="card p-4 mb-4 border border-herb/30">
      <p className="text-sm font-semibold text-herb mb-1">{tx.disputeApprovedTitle}</p>
      <p className="text-xs text-cream/60">{tx.disputeApprovedIntro}</p>
    </div>
  ) : null

  return (
    <>
      {duplicateBanner && (
        <div className="max-w-2xl mx-auto px-4 pt-20">
          {duplicateBanner}
        </div>
      )}
      <RecipeForm existing={existing} reviewFindings={reviewFindings} appliedFindingIndices={appliedFindingIndices} scrollToFieldOnMount={scrollToFieldOnMount} />
    </>
  )
}
