import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useSubmissionsFeed, useDuplicateDisputes, useRecipe, resolveDuplicateDispute } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { useTranslatedReview } from '../hooks/useTranslatedReview'
import { useToast } from '../hooks/useToast'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'
import type { QualityFinding, Recipe } from '../types'
import { t } from "../i18n";
import { OWNER_USER_ID } from '../lib/admin'

const SEVERITY_CLASS: Record<QualityFinding['severity'], string> = {
  critical: 'bg-red-500/10 text-red-400',
  major: 'bg-amber/10 text-amber',
  minor: 'bg-tint/10 text-cream/50',
}

interface SubmissionCardProps {
  recipe: Recipe
  expanded: boolean
  onToggle: () => void
}

// Its own component (not inlined in the list map) because it needs to call
// useTranslatedReview - hooks can't be called inside a .map() callback.
function SubmissionCard({ recipe: r, expanded: isExpanded, onToggle }: SubmissionCardProps) {
  const { lang } = useLanguage()
  const tx = t[lang]
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const review = useTranslatedReview(r.qualityReview ?? null, lang, getToken)
  if (!review) return null
  const passed = r.status === 'published'

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <button type="button" onClick={() => navigate(`/recipes/${r.id}`)} className="font-serif text-base font-medium text-cream hover:text-amber transition-colors text-start">
          {r.title}
        </button>
        <div className="shrink-0 flex items-center gap-2">
          <span className={`text-xs font-bold ${passed ? 'text-herb' : 'text-red-400'}`}>
            {review.score}%
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            passed ? 'bg-herb/10 text-herb' : 'bg-red-500/10 text-red-400'
          }`}>
            {passed
              ? (tx.published)
              : (tx.rejected)}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-cream/30 mb-2">
        {r.ownerName ?? r.ownerId} · {new Date(review.checkedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
      </p>

      {review.findings.length > 0 && (
        <>
          <button type="button" onClick={onToggle} className="text-xs text-cream/40 hover:text-cream/70 transition-colors">
            {isExpanded
              ? (tx.hideFindings)
              : (lang === 'he' ? `הצג ${review.findings.length} ממצאים` : `Show ${review.findings.length} finding${review.findings.length > 1 ? 's' : ''}`)}
          </button>
          {isExpanded && (
            <ul className="mt-2 space-y-1.5">
              {review.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${SEVERITY_CLASS[f.severity]}`}>
                    {f.severity}
                  </span>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

interface DisputeCardProps {
  recipe: Recipe
  onResolved: () => void
}

function DisputeCard({ recipe: r, onResolved }: DisputeCardProps) {
  const { lang } = useLanguage()
  const tx = t[lang]
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { showToast } = useToast()
  const [resolving, setResolving] = useState(false)
  const { recipe: matchedRecipe } = useRecipe(r.duplicateReview?.matchedRecipeId)

  async function resolve(approve: boolean) {
    setResolving(true)
    try {
      await resolveDuplicateDispute(r.id, approve, getToken)
      onResolved()
    } catch {
      showToast(tx.submissionFailed, 'error')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="card p-4">
      {r.duplicateReview && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Link to={`/recipes/${r.id}`} className="block">
            <div className="relative h-24 rounded-lg overflow-hidden bg-tint/[0.04] mb-1">
              {r.image?.includes('assets.tugy.dev') && (
                <SkeletonImage src={resizedImage(r.image, 320)} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
              )}
            </div>
            <p className="text-[10px] text-cream/40 truncate">{tx.newSubmission}: {r.title}</p>
          </Link>
          <Link to={`/recipes/${r.duplicateReview.matchedRecipeId}`} className="block">
            <div className="relative h-24 rounded-lg overflow-hidden bg-tint/[0.04] mb-1">
              {matchedRecipe?.image?.includes('assets.tugy.dev') && (
                <SkeletonImage src={resizedImage(matchedRecipe.image, 320)} alt={r.duplicateReview.matchedRecipeTitle} className="w-full h-full object-cover" loading="lazy" />
              )}
            </div>
            <p className="text-[10px] text-cream/40 truncate">{r.duplicateReview.matchedRecipeTitle}</p>
          </Link>
        </div>
      )}
      <button type="button" onClick={() => navigate(`/recipes/${r.id}`)} className="font-serif text-base font-medium text-cream hover:text-amber transition-colors text-start block mb-1">
        {r.title}
      </button>
      {r.duplicateReview && (
        <>
          <p className="text-xs text-cream/50 mb-1">
            {tx.duplicateBlockedIntro(r.duplicateReview.matchedRecipeTitle)}
          </p>
          <p className="text-xs text-cream/30 mb-3">{r.duplicateReview.reason}</p>
        </>
      )}
      {r.disputeMessage && (
        <p className="text-xs text-cream/60 mb-3 italic">
          {tx.ownerSDisputeMessage} {r.disputeMessage}
        </p>
      )}
      {r.duplicateReview && (
        <Link to={`/recipes/${r.duplicateReview.matchedRecipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors">
          {tx.viewSimilarRecipe}
        </Link>
      )}
      <div className="flex items-center gap-2 mt-3">
        <button type="button" disabled={resolving} onClick={() => resolve(true)} className="btn-ghost text-xs">
          {tx.approveDispute}
        </button>
        <button type="button" disabled={resolving} onClick={() => resolve(false)} className="btn-ghost text-xs">
          {tx.denyDispute}
        </button>
      </div>
    </div>
  )
}

export default function SubmissionsPage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const { userId } = useAuth()
  const isOwner = userId === OWNER_USER_ID
  const { recipes: disputes, loading: disputesLoading, reload: reloadDisputes } = useDuplicateDisputes(isOwner)
  const { recipes, loading } = useSubmissionsFeed()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      {isOwner && !disputesLoading && disputes.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif text-lg font-bold text-cream mb-3">{tx.duplicateDisputes}</h2>
          <div className="space-y-3">
            {disputes.map(r => (
              <DisputeCard key={r.id} recipe={r} onResolved={reloadDisputes} />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-cream/30 text-sm">{tx.loading}</p>
      ) : recipes.length === 0 ? (
        <p className="text-cream/30 text-sm">
          {tx.noSubmissionsYet}
        </p>
      ) : (
        <div className="space-y-3">
          {recipes.map(r => (
            <SubmissionCard key={r.id} recipe={r} expanded={expanded.has(r.id)} onToggle={() => toggle(r.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
