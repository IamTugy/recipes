import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import RecipePlaceholder from './RecipePlaceholder'
import RecipeDetailSkeleton from './RecipeDetailSkeleton'
import Breadcrumbs from './Breadcrumbs'
import RecipeSectionNav from './RecipeSectionNav'
import FilterInfoPopover from './FilterInfoPopover'
import { useTranslatedReview } from '../hooks/useTranslatedReview'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useRecipe, useRecipes, deleteRecipe, submitForReview } from '../hooks/useRecipes'
import { OWNER_USER_ID } from '../lib/admin'
import { ApiError, apiFetch } from '../lib/api'
import { useWakeLock } from '../hooks/useWakeLock'
import { useFavorites } from '../hooks/useFavorites'
import { useCookedRecipes } from '../hooks/useCookedRecipes'
import { useCollections } from '../hooks/useCollections'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { useNote } from '../hooks/useNote'
import { useTranslatedRecipe } from '../hooks/useTranslatedRecipe'
import { useAuth } from '@clerk/react'
import { formatTime, formatSeconds, scaleAmount } from '../utils/format'
import { t, categoryEmoji, heUnit, difficultyColor } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import ReviewItem, { type Review } from './ReviewItem'
import ConfirmDialog from './ConfirmDialog'
import type { TimerState, RecipeRevision, QualityReview } from '../types'

interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  timers: TimerState[]
  timerBarHeight: number
  onAddToShoppingList: (items: { name: string; amount: number | null; unit: string }[]) => void
}

const presetMultipliers = [0.5, 1, 1.5, 2, 3, 4]
const presetLabels: Record<number, string> = { 0.5: '½x', 1: '1x', 1.5: '1.5x', 2: '2x', 3: '3x', 4: '4x' }

export default function RecipeDetail({ onAddTimer, timers, timerBarHeight, onAddToShoppingList }: RecipeDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { recipe, loading: recipeLoading, reload: reloadRecipe } = useRecipe(id)
  const { recipes: allRecipes } = useRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { cookedSlugs, toggle: toggleCooked } = useCookedRecipes()
  const { collections, create: createCollection, addRecipe: addRecipeToCollection, removeRecipe: removeRecipeFromCollection } = useCollections()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardIndex, setWizardIndex] = useState(0)
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const collectionMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collectionMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (collectionMenuRef.current && !collectionMenuRef.current.contains(e.target as Node)) {
        setCollectionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [collectionMenuOpen])
  const { addRecent } = useRecentlyViewed()
  const { text: savedNote, save: saveNote, status: noteStatus } = useNote(id)
  const { getToken, userId: currentUserId } = useAuth()
  const { showToast } = useToast()
  const isAdmin = currentUserId === OWNER_USER_ID
  const isOwner = !!currentUserId && (!recipe?.ownerId || recipe.ownerId === currentUserId)
  const canEdit = isOwner || isAdmin

  const [multiplier, setMultiplier] = useState(1)
  const [customInput, setCustomInput] = useState('')
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const [userRating, setUserRating] = useState<number | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [noteInput, setNoteInput] = useState('')
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewComment, setReviewComment] = useState('')
  const [reviewPhotoUrl, setReviewPhotoUrl] = useState<string | null>(null)
  const [reviewPhotoUploading, setReviewPhotoUploading] = useState(false)
  const [distribution, setDistribution] = useState<Record<1 | 2 | 3 | 4 | 5, number> | null>(null)
  const [hasPostedReview, setHasPostedReview] = useState(false)
  const [isEditingReview, setIsEditingReview] = useState(false)
  const [translations, setTranslations] = useState<Record<string, { text: string; showing: boolean; loading: boolean }>>({})
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const cookMode = useWakeLock()

  // Sync the textarea once the saved note has loaded for this recipe
  useEffect(() => {
    setNoteInput(savedNote)
  }, [savedNote])

  async function loadReviews() {
    const token = await getToken()
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const [reviewsRes, distributionRes] = await Promise.all([
      fetch(`/api/ratings/${id}/reviews`, { headers }),
      fetch(`/api/ratings/${id}/distribution`, { headers }),
    ])
    if (reviewsRes.ok) setReviews(await reviewsRes.json())
    if (distributionRes.ok) setDistribution(await distributionRes.json())
  }

  async function toggleTranslateReview(userId: string, comment: string) {
    const existing = translations[userId]
    if (existing && !existing.loading) {
      setTranslations(prev => ({ ...prev, [userId]: { ...existing, showing: !existing.showing } }))
      return
    }
    setTranslations(prev => ({ ...prev, [userId]: { text: '', showing: true, loading: true } }))
    try {
      const token = await getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch('/api/translations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: comment, targetLang: lang }),
      })
      const data = res.ok ? await res.json() : null
      setTranslations(prev => ({ ...prev, [userId]: { text: data?.translated ?? comment, showing: true, loading: false } }))
    } catch {
      setTranslations(prev => ({ ...prev, [userId]: { text: comment, showing: true, loading: false } }))
    }
  }

  async function loadMyRating() {
    const token = await getToken()
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`/api/ratings/${id}/mine`, { headers })
    if (!res.ok) return
    const mine: { score: number; comment: string | null; photoUrl: string | null } | null = await res.json()
    setUserRating(mine?.score ?? null)
    setReviewComment(mine?.comment ?? '')
    setReviewPhotoUrl(mine?.photoUrl ?? null)
    setHasPostedReview(!!mine?.comment)
  }

  useEffect(() => {
    if (id) {
      loadReviews()
      loadMyRating()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function submitRating(score: number, comment?: string, photoUrl?: string) {
    setUserRating(score)
    const token = await getToken()
    await fetch(`/api/ratings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ score, comment, photoUrl }),
    })
    loadReviews()
  }

  function rate(score: number) {
    submitRating(score)
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !id) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return

    setReviewPhotoUploading(true)
    try {
      const token = await getToken()
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipeId: id, contentType: file.type }),
      })
      if (!presignRes.ok) return
      const { uploadUrl, publicUrl } = await presignRes.json()
      const uploadResult = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (uploadResult.ok) setReviewPhotoUrl(publicUrl)
    } finally {
      setReviewPhotoUploading(false)
    }
  }

  async function createAndAddCollection() {
    const name = newCollectionName.trim()
    if (!name || !id) return
    const created = await createCollection(name)
    if (created) await addRecipeToCollection(created._id, id)
    setNewCollectionName('')
    showToast(lang === 'he' ? `נוסף לאוסף "${name}"` : `Added to "${name}"`)
  }

  function postReview() {
    if (!userRating) return
    submitRating(userRating, reviewComment.trim(), reviewPhotoUrl ?? undefined)
    const wasAlreadyPosted = hasPostedReview
    setHasPostedReview(true)
    setIsEditingReview(false)
    showToast(
      wasAlreadyPosted
        ? (lang === 'he' ? 'הביקורת עודכנה' : 'Review updated')
        : (lang === 'he' ? 'הביקורת פורסמה' : 'Review posted')
    )
  }

  async function deleteMyReview() {
    const confirmMsg = lang === 'he' ? 'למחוק את הביקורת שלכם?' : 'Delete your review?'
    if (!window.confirm(confirmMsg)) return
    const token = await getToken()
    await fetch(`/api/ratings/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    setUserRating(null)
    setReviewComment('')
    setReviewPhotoUrl(null)
    setHasPostedReview(false)
    setIsEditingReview(false)
    loadReviews()
    showToast(lang === 'he' ? 'הביקורת נמחקה' : 'Review deleted')
  }

  async function share() {
    // Route through /share/recipes/:id instead of the page's own hash URL -
    // link-preview crawlers (WhatsApp, iMessage, Slack) don't run JS, so they
    // need a server-rendered page with this recipe's own og:image/og:title.
    // Carry the currently-viewed revision along too, so sharing an older
    // version previews and links to that version, not whatever's live now.
    // When sharing the live version, tack on the published revision number -
    // crawlers cache previews per exact URL, so without this, editing a
    // recipe's photo/title after it's been shared once would leave every
    // future share stuck showing the old preview forever.
    const shareQuery = viewingRevision
      ? `?rev=${viewingRevision.id}`
      : recipe?.publishedRevision != null ? `?v=${recipe.publishedRevision}` : ''
    const shareUrl = id
      ? `${window.location.origin}/share/recipes/${id}${shareQuery}`
      : window.location.href
    const shareData = { title: displayTitle, text: displayDescription, url: shareUrl }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch { /* user cancelled */ }
      return
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDeleteRecipe() {
    if (!id) return
    setDeleting(true)
    try {
      await deleteRecipe(id, getToken)
      navigate('/')
      showToast(lang === 'he' ? 'המתכון נמחק' : 'Recipe deleted')
    } catch (err) {
      const message = err instanceof ApiError && err.status === 403
        ? (lang === 'he' ? 'אין הרשאה למחוק מתכון זה' : 'You don\'t have permission to delete this recipe')
        : (lang === 'he' ? 'מחיקת המתכון נכשלה. נסו שוב.' : 'Failed to delete the recipe. Please try again.')
      showToast(message, 'error')
    } finally {
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [reviewResult, setReviewResult] = useState<QualityReview | null>(null)
  const [revisionsOpen, setRevisionsOpen] = useState(false)
  const [viewingRevision, setViewingRevision] = useState<RecipeRevision | null>(null)
  const [revisions, setRevisions] = useState<RecipeRevision[] | null>(null)

  async function loadRevisions(): Promise<RecipeRevision[]> {
    if (!id) return []
    try {
      const data = await apiFetch<RecipeRevision[]>(`/recipes/${id}/revisions`, getToken)
      setRevisions(data)
      return data
    } catch {
      setRevisions([])
      return []
    }
  }

  // Keeps the ?rev= query param in sync with which revision is on screen, so
  // the URL (and the Share button, which reads it from here) always points
  // at exactly what the viewer is looking at - not just whatever's live now.
  function selectRevision(rev: RecipeRevision | null) {
    setViewingRevision(rev)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (rev) next.set('rev', rev.id)
      else next.delete('rev')
      return next
    }, { replace: true })
  }

  // A recipe opened via a shared link that includes ?rev= should land
  // directly on that revision's content, not the live one.
  useEffect(() => {
    const rev = searchParams.get('rev')
    if (!rev || !id) return
    loadRevisions().then(revs => {
      const match = revs.find(r => r.id === rev)
      if (match) setViewingRevision(match)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Submission is synchronous now: the deterministic required-field check
  // and the AI quality review both run server-side in this one request, and
  // the response already carries the outcome (published or rejected, with
  // qualityReview.findings/suggestedFields set) - no reload/poll needed.
  async function handleSubmitForReview() {
    if (!id) return
    setSubmitting(true)
    setReviewResult(null)
    setSubmitError(null)
    try {
      const result = await submitForReview(id, getToken)
      setReviewResult(result.qualityReview ?? null)
      showToast(
        result.status === 'published'
          ? (lang === 'he' ? 'המתכון פורסם!' : 'Recipe published!')
          : (lang === 'he' ? 'המתכון לא עבר את הבדיקה' : "Recipe didn't pass review"),
        result.status === 'published' ? 'success' : 'error'
      )
      await reloadRecipe()
    } catch (err) {
      // The missing-fields message is a list the user needs time to read and
      // act on - a 3s toast disappears before they can even finish reading
      // it. Keep it pinned near the Submit button until they dismiss it or
      // try again.
      const message = err instanceof ApiError ? err.message : (lang === 'he' ? 'השליחה נכשלה' : 'Submission failed')
      setSubmitError(message)
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Reset checked steps/ingredients and scroll when recipe changes
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`checked-${id}`)
      setCheckedSteps(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedSteps(new Set()) }
    try {
      const saved = sessionStorage.getItem(`checked-ingredients-${id}`)
      setCheckedIngredients(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedIngredients(new Set()) }
    window.scrollTo({ top: 0, behavior: 'instant' })
    setViewingRevision(null)
    setRevisionsOpen(false)
    setRevisions(null)
  }, [id])

  // Track this recipe as recently viewed once it has loaded
  useEffect(() => {
    if (recipe) addRecent(recipe.id)
  }, [recipe, addRecent])

  const stepsCount = recipe?.steps.reduce((n, g) => n + g.items.length, 0) ?? 0
  const wizardRef = useRef<HTMLDivElement>(null)
  useFocusTrap(wizardRef, wizardOpen)
  const lightboxRef = useRef<HTMLDivElement>(null)
  useFocusTrap(lightboxRef, !!lightboxUrl)

  useEffect(() => {
    if (!wizardOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setWizardIndex(i => Math.min(i + 1, stepsCount - 1))
      if (e.key === 'ArrowLeft') setWizardIndex(i => Math.max(i - 1, 0))
      if (e.key === 'Escape') setWizardOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [wizardOpen, stepsCount])

  useEffect(() => {
    if (!wizardOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [wizardOpen])

  useEffect(() => {
    if (wizardOpen) void cookMode.request()
    else void cookMode.release()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cookMode is a new object every render; request/release are individually stable
  }, [wizardOpen, cookMode.request, cookMode.release])

  useEffect(() => {
    if (!lightboxUrl) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxUrl(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lightboxUrl])

  // Browsing an older revision swaps in that revision's content for
  // everything content-related (title, image, ingredients, steps, ...)
  // while status/ownership/ratings/etc keep coming from the live recipe.
  // Computed unconditionally (recipe may still be loading/missing here) so
  // useTranslatedRecipe below is called on every render - hooks can never
  // sit after an early return.
  const rawDisplayRecipe: typeof recipe | undefined = recipe
    ? (viewingRevision ? { ...recipe, ...(viewingRevision.snapshot as Partial<typeof recipe>) } : recipe)
    : undefined
  // Auto-fills whichever language the recipe wasn't written in, purely
  // for display - the underlying data/edit form is untouched.
  const displayRecipe = useTranslatedRecipe(rawDisplayRecipe, getToken)
  // Same "compute unconditionally before any early return" rule applies
  // here - the AI review always responds in English, so this translates
  // its findings to Hebrew on the fly when that's the active UI language.
  const rawReview = reviewResult ?? recipe?.qualityReview ?? null
  const review = useTranslatedReview(rawReview, lang, getToken)

  if (recipeLoading) {
    return <RecipeDetailSkeleton />
  }

  if (!recipe || !displayRecipe) {
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
  const isViewingNonLatestRevision = viewingRevision != null
    && viewingRevision.revisionNumber !== (canEdit ? recipe.currentRevision : recipe.publishedRevision)

  // Ratings/favorites/reviews are about the published recipe specifically -
  // a non-owner always sees that (gated server-side), but the owner might be
  // looking at a private draft-in-progress that nobody has rated yet, or an
  // older/newer revision than what's actually live. Only show the social
  // features when what's on screen really is the published content.
  const isViewingPublishedContent = recipe.publishedRevision != null && (
    !canEdit || (viewingRevision
      ? viewingRevision.revisionNumber === recipe.publishedRevision
      : recipe.status === 'published' && recipe.currentRevision === recipe.publishedRevision)
  )

  const totalTime = displayRecipe.prepTime + displayRecipe.cookTime
  const scaledServings = Math.round(displayRecipe.servings * multiplier)

  const nutrition = displayRecipe.nutrition
  const hasNutrition = !!nutrition && [nutrition.calories, nutrition.protein, nutrition.carbs, nutrition.fat].some(v => v !== undefined)
  const nutritionRows = hasNutrition
    ? ([
        ['calories', tx.calories],
        ['protein', tx.protein],
        ['carbs', tx.carbs],
        ['fat', tx.fat],
      ] as const)
      .filter(([key]) => nutrition![key] !== undefined)
      .map(([key, label]) => {
        const per100g = nutrition![key]!
        const perServing = nutrition!.servingWeight ? (per100g * nutrition!.servingWeight) / 100 : undefined
        return {
          label,
          per100g: Math.round(per100g).toString(),
          perServing: perServing !== undefined ? Math.round(perServing).toString() : undefined,
        }
      })
    : []


  const displayTitle = lang === 'he' ? (displayRecipe.titleHe ?? displayRecipe.title) : displayRecipe.title
  const displaySubtitle = lang === 'he' ? displayRecipe.title : displayRecipe.titleHe
  const displayDescription = lang === 'he'
    ? displayRecipe.description
    : (displayRecipe.descriptionEn ?? displayRecipe.description)
  const displayTips = lang === 'he'
    ? (displayRecipe.tips ?? [])
    : (displayRecipe.tipsEn ?? displayRecipe.tips ?? [])

  const relatedRecipes = allRecipes
    .filter(r => r.id !== recipe.id && r.category === displayRecipe.category && !r.hidden)
    .slice(0, 4)

  function addAllToShoppingList() {
    const items = displayRecipe!.ingredients.flatMap(group =>
      group.items.map(item => {
        const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
        if (!item.amount) return { name: itemName, amount: null, unit: item.unit }
        return { name: itemName, amount: item.amount * multiplier, unit: item.unit }
      })
    )
    onAddToShoppingList(items)
    showToast(lang === 'he' ? `${items.length} פריטים נוספו לרשימת הקניות` : `Added ${items.length} items to your shopping list`)
  }

  function toggleStep(key: string) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  function markStepChecked(key: string) {
    setCheckedSteps(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev).add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  // "Mark done" in guided mode both checks the step and advances the wizard,
  // same as Next - but un-marking (clicking it again on an already-checked
  // step) only toggles it off, since that's a correction, not progress.
  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      setWizardOpen(false)
    } else {
      setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
    }
  }

  function handleWizardMarkDone(key: string) {
    if (checkedSteps.has(key)) {
      toggleStep(key)
      return
    }
    markStepChecked(key)
    advanceWizardOrFinish()
  }

  function toggleIngredient(key: string) {
    setCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { sessionStorage.setItem(`checked-ingredients-${id}`, JSON.stringify([...next])) } catch { /* sessionStorage unavailable */ }
      return next
    })
  }

  function getTimerForStep(groupIdx: number, stepIdx: number) {
    const key = groupIdx * 10000 + stepIdx
    return timers.find(t => t.recipeId === recipe!.id && t.stepIndex === key)
  }

  function startTimer(label: string, minutes: number, groupIdx: number, stepIdx: number) {
    onAddTimer(label, minutes, recipe!.id, groupIdx * 10000 + stepIdx)
  }

  function handleCustomInput(val: string) {
    setCustomInput(val)
    if (val === '') {
      setMultiplier(1)
      return
    }
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0 && n <= 100 && recipe!.servings > 0) {
      setMultiplier(n / recipe!.servings)
    }
  }

  function handlePresetClick(m: number) {
    setMultiplier(m)
    setCustomInput('')
  }

  // Precompute sequential step numbers to avoid mutable counter inside render
  let _n = 0
  const stepNums = displayRecipe.steps.map(g => g.items.map(() => ++_n))

  const flatSteps = displayRecipe.steps.flatMap((group, gi) =>
    group.items.map((step, si) => ({
      groupIdx: gi,
      stepIdx: si,
      stepNum: stepNums[gi][si],
      instruction: lang === 'he' ? step.instruction : (step.instructionEn ?? step.instruction),
      tip: lang === 'he' ? step.tip : (step.tipEn ?? step.tip),
      timerMinutes: step.timerMinutes,
      image: step.image,
    }))
  )

  function openWizard() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    setWizardIndex(firstUnchecked === -1 ? 0 : firstUnchecked)
    setWizardOpen(true)
  }

  const sectionNavItems = [
    displayRecipe.ingredients.length > 0 && { id: 'ingredients-heading', label: tx.ingredients, emoji: '🥕' },
    flatSteps.length > 0 && { id: 'steps-heading', label: tx.instructions, emoji: '📋' },
    displayTips.length > 0 && { id: 'tips-heading', label: tx.tipsTitle, emoji: '💡' },
    { id: 'my-notes-heading', label: lang === 'he' ? 'ההערות שלי' : 'My Notes', emoji: '📝' },
    isViewingPublishedContent && { id: 'reviews-heading', label: lang === 'he' ? 'ביקורות' : 'Reviews', emoji: '💬' },
  ].filter((s): s is { id: string; label: string; emoji: string } => !!s)

  return (
    <div className="min-h-dvh bg-bg pt-14" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <RecipeSectionNav sections={sectionNavItems} lang={lang} />
      {/* Hero image */}
      <div className="print:hidden relative h-64 sm:h-96 overflow-hidden">
        {displayRecipe.image?.includes('assets.tugy.dev') ? (
          <img
            src={displayRecipe.image}
            alt={displayTitle}
            onClick={() => setLightboxUrl(displayRecipe.image!)}
            className="w-full h-full object-cover cursor-zoom-in"
          />
        ) : (
          <RecipePlaceholder recipe={displayRecipe} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent pointer-events-none" />
        <button type="button"
          onClick={() => navigate(-1)}
          className={`print:hidden absolute top-4 ${lang === 'he' ? 'right-4' : 'left-4'} flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-sm text-white/80 hover:text-white rounded-xl text-sm transition-colors border border-white/10`}
        >
          <svg
            className={`w-4 h-4 ${lang === 'he' ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {tx.back}
        </button>
        {canEdit && (
          <div className={`print:hidden absolute top-4 ${lang === 'he' ? 'left-4' : 'right-4'} flex items-center gap-2`}>
            {(recipe.currentRevision !== recipe.publishedRevision || recipe.status === 'pending_review') && (
              <button type="button"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={submitting || recipe.status === 'pending_review'}
                title={recipe.status === 'pending_review' ? (lang === 'he' ? 'ממתין לבדיקת AI' : 'Pending AI review') : undefined}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber text-bg hover:bg-amber/90 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {recipe.status === 'pending_review'
                  ? (lang === 'he' ? 'ממתין לבדיקת AI...' : 'Pending AI review...')
                  : submitting
                    ? (lang === 'he' ? 'בודק עם AI...' : 'Reviewing with AI...')
                    : (lang === 'he' ? 'פרסם' : 'Publish')}
              </button>
            )}
            <button type="button"
              onClick={() => navigate(`/recipes/${id}/edit`)}
              disabled={recipe.status === 'pending_review'}
              title={recipe.status === 'pending_review' ? (lang === 'he' ? 'המתכון נעול בזמן בדיקת AI' : 'Locked while pending AI review') : undefined}
              className="flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-sm text-white/80 hover:text-white rounded-xl text-sm transition-colors border border-white/10 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {lang === 'he' ? 'עריכה' : 'Edit'}
            </button>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-16 relative pb-24 print:max-w-none print:mx-0 print:mt-0 print:px-0 print:pb-0">
        <Breadcrumbs crumbs={[
          { label: lang === 'he' ? 'בית' : 'Home', href: '/' },
          { label: tx.categories[displayRecipe.category] },
          { label: displayTitle },
        ]} />
        {/* Header card */}
        <div className="card p-6 mb-6 print:p-0 print:mb-5 print:border-0 print:shadow-none print:bg-transparent">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="tag">{categoryEmoji[displayRecipe.category]} {tx.categories[displayRecipe.category]}</span>
            {displayRecipe.cuisine && <span className="tag">{displayRecipe.cuisine}</span>}
            <span className={`tag font-semibold ${difficultyColor[displayRecipe.difficulty]}`}>
              {tx.difficulty[displayRecipe.difficulty]}
            </span>
            {isViewingNonLatestRevision && (
              <span className="tag font-semibold bg-amber/10 text-amber">
                {lang === 'he' ? `צופה בגרסה v${viewingRevision!.revisionNumber}` : `Viewing v${viewingRevision!.revisionNumber}`}
              </span>
            )}
            {recipe.status && recipe.status !== 'published' && canEdit && (
              <span className={`tag font-semibold ${
                recipe.status === 'draft'
                  ? 'bg-tint/10 text-cream/40'
                  : recipe.status === 'pending_review'
                    ? 'bg-amber/10 text-amber'
                    : 'bg-red-500/10 text-red-400'
              }`}>
                {recipe.status === 'draft'
                  ? (lang === 'he' ? 'טיוטה' : 'Draft')
                  : recipe.status === 'pending_review'
                    ? (lang === 'he' ? 'ממתין לבדיקת AI' : 'Pending AI review')
                    : (lang === 'he' ? 'נדחה' : 'Rejected')}
              </span>
            )}
          </div>

          {canEdit && recipe.status === 'published' && recipe.currentRevision !== recipe.publishedRevision && (
            <p className="text-xs text-amber mb-2">
              {lang === 'he' ? 'יש לכם שינויים שלא פורסמו' : 'You have unpublished changes'}
            </p>
          )}

          {submitError && canEdit && (() => {
            const match = submitError.match(/missing\/invalid:\s*(.+)$/i)
            const items = match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : null
            return (
              <div className="card p-3 mb-4 border border-red-400/20">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-red-400 font-medium">
                    {lang === 'he' ? 'לא ניתן לשלוח - יש להשלים:' : "Can't submit yet - needs:"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitError(null)}
                    aria-label={lang === 'he' ? 'סגור' : 'Dismiss'}
                    className="shrink-0 text-cream/30 hover:text-cream/60 transition-colors"
                  >
                    ✕
                  </button>
                </div>
                {items ? (
                  <ul className="mt-2 space-y-1 list-disc ps-5">
                    {items.map((item, i) => (
                      <li key={i} className="text-xs text-red-400/90">{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-red-400/90">{submitError}</p>
                )}
              </div>
            )
          })()}

          {/* AI review results - either the outcome of the submission just
              made, or the recipe's last stored review (so a rejected recipe
              still shows its findings on reload, not just right after
              submitting). */}
          {canEdit && review && recipe.status !== 'published' && (
            <div className={`card p-4 mb-4 border ${review.score >= 95 ? 'border-herb/30' : 'border-red-400/20'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-cream">
                  {lang === 'he' ? 'תוצאת בדיקת AI' : 'AI review result'}
                </span>
                <span className={`text-lg font-bold ${review.score >= 95 ? 'text-herb' : 'text-red-400'}`}>
                  {review.score}%
                </span>
              </div>
              {review.findings.length > 0 ? (
                <ul className="space-y-1.5 mb-3">
                  {review.findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        f.severity === 'critical' ? 'bg-red-500/10 text-red-400'
                        : f.severity === 'major' ? 'bg-amber/10 text-amber'
                        : 'bg-tint/10 text-cream/50'
                      }`}>
                        {f.severity}
                      </span>
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-cream/40 mb-3">
                  {lang === 'he' ? 'לא נמצאו בעיות' : 'No issues found'}
                </p>
              )}
              {recipe.status === 'rejected' && review.suggestedFields && (
                <button
                  type="button"
                  onClick={() => navigate(`/recipes/${id}/edit?applySuggestions=1`)}
                  className="btn-ghost text-xs"
                >
                  {lang === 'he' ? 'החל תיקונים' : 'Apply changes'}
                </button>
              )}
            </div>
          )}

          {displayRecipe.aiGenerated && (
            <div className="print:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-amber bg-amber/10 border border-amber/20 rounded-full px-3 py-1 mb-3">
              <span>{lang === 'he' ? 'נוצר בשיתוף AI' : 'AI co-authored'}</span>
              <FilterInfoPopover text={lang === 'he'
                ? 'המתכון הזה נכתב בשיתוף AI שחיפש ברשת מתכונים אמיתיים והתחיל מהם - אך מי שפרסם אותו בדק, אישר, ויכול לערוך כל חלק בו. הוא לא הומצא על ידי AI. ראו קרדיטים למטה למקורות ההשראה.'
                : 'This recipe was co-authored with AI - it started from real recipes AI found online, then was reviewed and approved by the person who posted it, who can edit any part of it. Not invented by AI. See the sources below for what it was inspired by.'}
              />
            </div>
          )}

          <h1
            className="font-serif text-3xl sm:text-4xl font-bold text-cream leading-tight mb-1"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            {displayTitle}
          </h1>
          {displaySubtitle && (
            <p
              className="text-cream/40 text-lg mb-3"
              dir={lang === 'he' ? 'ltr' : 'rtl'}
            >
              {displaySubtitle}
            </p>
          )}
          {recipe.status === 'published' && recipe.ownerName && (
            <Link to={`/chef/${recipe.ownerId}`} className="inline-block text-cream/30 hover:text-cream/60 text-xs mb-3 transition-colors">
              {lang === 'he' ? `פורסם על ידי ${recipe.ownerName}` : `Published by ${recipe.ownerName}`}
            </Link>
          )}
          <p
            className="text-cream/70 text-base leading-relaxed mb-5"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            {displayDescription}
          </p>

          {recipe.source && (
            <p className="text-cream/30 text-xs mb-5">
              {lang === 'he' ? 'מקור: ' : 'Source: '}
              {recipe.source.startsWith('http') ? (
                <a href={recipe.source} target="_blank" rel="noopener noreferrer" className="underline hover:text-cream/60 transition-colors">
                  {recipe.source.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
                </a>
              ) : (
                recipe.source
              )}
            </p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-5 gap-3 print:gap-2">
            {[
              { label: tx.prep, value: formatTime(displayRecipe.prepTime), icon: '🔪' },
              { label: tx.cook, value: formatTime(displayRecipe.cookTime), icon: '🔥' },
              { label: tx.total, value: formatTime(totalTime), icon: '⏱' },
              { label: tx.servings, value: scaledServings.toString(), icon: '🍽' },
            ].map(item => (
              <div key={item.label} className="bg-tint/[0.03] print:bg-transparent print:border print:border-tint/15 rounded-xl print:rounded-lg p-3 print:p-2 text-center border border-tint/5">
                <p className="text-xl mb-1">{item.icon}</p>
                <p className="font-bold text-cream text-lg">{item.value}</p>
                <p className="text-cream/40 text-xs">{item.label}</p>
              </div>
            ))}
          </div>

          {hasNutrition && (
            <div className="mt-5">
              <h2 className="font-serif text-lg font-bold text-cream mb-2">{tx.nutritionTitle}</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-tint/10">
                    <th className="text-start py-1.5 font-medium text-cream/50"></th>
                    <th className="text-end py-1.5 font-medium text-cream/50">{tx.per100g}</th>
                    {displayRecipe.nutrition?.servingWeight && (
                      <th className="text-end py-1.5 font-medium text-cream/50">
                        {tx.perServing} ({Math.round(displayRecipe.nutrition.servingWeight)}g)
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {nutritionRows.map(row => (
                    <tr key={row.label} className="border-b border-tint/5">
                      <td className="py-1.5 text-cream/70">{row.label}</td>
                      <td className="py-1.5 text-end text-cream font-medium">{row.per100g}</td>
                      {displayRecipe.nutrition?.servingWeight && (
                        <td className="py-1.5 text-end text-cream font-medium">{row.perServing}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-cream/30 text-xs mt-2">{tx.nutritionDisclaimer}</p>
            </div>
          )}

          {/* Primary actions: mark as cooked + rating get the strongest visual weight */}
          {isViewingPublishedContent && (
            <div className="print:hidden flex flex-wrap items-center gap-4 mt-5 pt-5 border-t border-tint/[0.06]">
              <button type="button"
                onClick={() => id && toggleCooked(id)}
                aria-pressed={!!id && cookedSlugs.has(id)}
                title={lang === 'he' ? 'סמנו שבישלתם את המתכון הזה בפועל, כדי לעקוב אחרי מה שכבר הכנתם' : "Mark that you've actually cooked this recipe, to keep track of what you've made"}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  id && cookedSlugs.has(id)
                    ? 'bg-herb text-white'
                    : 'bg-amber text-bg hover:bg-amber/90'
                }`}
              >
                <span className="text-lg leading-none">{id && cookedSlugs.has(id) ? '✅' : '🍳'}</span>
                {id && cookedSlugs.has(id)
                  ? (lang === 'he' ? 'בישלתי את זה' : 'Made it')
                  : (lang === 'he' ? 'סמן כבושל' : 'Mark as cooked')}
                {!!recipe.cookCount && (
                  <span className="opacity-70 text-xs">({recipe.cookCount})</span>
                )}
              </button>

              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map(n => (
                  <button type="button" key={n} onClick={() => rate(n)} className="text-2xl leading-none p-1">
                    <span className={n <= (userRating ?? 0) ? 'text-amber' : 'text-cream/20'}>★</span>
                  </button>
                ))}
                {!!recipe.averageRating && (
                  <span className="text-cream/40 text-xs ms-1.5">
                    {recipe.averageRating} ({recipe.ratingCount})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Favorite / share / print / other actions */}
          <div className={`print:hidden flex flex-wrap items-center gap-x-4 gap-y-3 ${isViewingPublishedContent ? 'mt-4' : 'mt-5 pt-5 border-t border-tint/[0.06]'}`}>
            {canEdit && recipe.publishedRevision != null && !isViewingPublishedContent && (
              <button type="button"
                onClick={async () => {
                  setRevisionsOpen(true)
                  const revs = revisions ?? await loadRevisions()
                  const live = revs.find(r => r.revisionNumber === recipe.publishedRevision)
                  if (live) selectRevision(live)
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-herb hover:text-herb/80 transition-colors"
              >
                <span>🌐</span>
                {lang === 'he' ? 'צפה בגרסה המפורסמת' : 'View published version'}
              </button>
            )}

            {isViewingPublishedContent && (
              <button type="button"
              onClick={() => toggleFavorite(recipe.id)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                favoriteSlugs.has(recipe.id) ? 'text-amber' : 'text-cream/40 hover:text-cream/70'
              }`}
            >
              <svg className="w-4 h-4" fill={favoriteSlugs.has(recipe.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
              </svg>
              {lang === 'he' ? 'מועדף' : 'Favorite'}
            </button>
            )}

            <div className="relative" ref={collectionMenuRef}>
              <button type="button"
                onClick={() => setCollectionMenuOpen(v => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14-7H5a2 2 0 00-2 2v14l4-2 3 2 3-2 3 2 3-2V6a2 2 0 00-2-2z" />
                </svg>
                {lang === 'he' ? 'שמור לאוסף' : 'Save to collection'}
              </button>
              {collectionMenuOpen && (
                <div className="absolute z-20 top-full mt-2 w-64 card p-3 shadow-xl" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                  {collections.length === 0 ? (
                    <p className="text-xs text-cream/30 mb-2">
                      {lang === 'he' ? 'אין עדיין אוספים' : 'No collections yet'}
                    </p>
                  ) : (
                    <ul className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                      {collections.map(col => {
                        const inCollection = id ? col.recipeIds.includes(id) : false
                        return (
                          <li key={col._id}>
                            <label className="flex items-center gap-2 text-sm text-cream/70 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={inCollection}
                                onChange={() => {
                                  if (!id) return
                                  if (inCollection) removeRecipeFromCollection(col._id, id)
                                  else addRecipeToCollection(col._id, id)
                                }}
                              />
                              {col.name}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      value={newCollectionName}
                      onChange={e => setNewCollectionName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createAndAddCollection() }}
                      placeholder={lang === 'he' ? 'אוסף חדש...' : 'New collection...'}
                      maxLength={60}
                      aria-label={lang === 'he' ? 'שם אוסף חדש' : 'New collection name'}
                      className="flex-1 bg-tint/[0.03] border border-tint/10 rounded-md px-2 py-1 text-xs text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
                    />
                    <button type="button"
                      onClick={createAndAddCollection}
                      disabled={!newCollectionName.trim()}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {lang === 'he' ? 'הוסף' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!!recipe.viewCount && (
              <span
                className="flex items-center gap-1 text-cream/30 text-xs"
                title={lang === 'he' ? 'מספר המבקרים הייחודיים, נספר פעם אחת ליום לכל אדם' : 'Unique visitors, counted once per person per day'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {recipe.viewCount}
              </span>
            )}

            {recipe.status === 'published' && recipe.ownerId && (
              <Link to={`/chef/${recipe.ownerId}`} className="flex items-center gap-1 text-cream/30 hover:text-cream/60 text-xs transition-colors">
                <span>👤</span>
                {recipe.ownerName
                  ? (lang === 'he' ? `עוד מ${recipe.ownerName}` : `More from ${recipe.ownerName}`)
                  : (lang === 'he' ? 'עוד מהשף הזה' : "More from this chef")}
              </Link>
            )}

            {displayRecipe.ingredients.length > 0 && (
              <button type="button"
                onClick={addAllToShoppingList}
                className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m-10 0a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                {lang === 'he' ? 'הוסף לרשימת קניות' : 'Add to list'}
              </button>
            )}

            {/* Personal recipes (never published) have nothing public to
                preview or link to, so sharing isn't offered at all. */}
            {recipe.publishedRevision != null && (
              <button type="button"
                onClick={share}
                className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684l-6.44 3.22a3 3 0 100 2.684l6.44-3.22zM8.684 13.342l6.632 3.316m0-11.317l-6.632 3.316" />
                </svg>
                {shareState === 'copied' ? (lang === 'he' ? 'הועתק!' : 'Copied!') : (lang === 'he' ? 'שתף' : 'Share')}
              </button>
            )}

            <button type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              {lang === 'he' ? 'הדפס' : 'Print'}
            </button>


            <button type="button"
              onClick={() => navigate(`/recipes/new?from=${id}`)}
              className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {lang === 'he' ? 'שכפל' : 'Duplicate'}
            </button>

            {(isAdmin || (isOwner && recipe.publishedRevision == null)) && (
              <button type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-red-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {lang === 'he' ? 'מחק' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {/* Portion control */}
        <div className="print:hidden card p-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-cream/60 text-sm font-medium">{tx.portions}</span>
            <div className="flex gap-1.5 flex-wrap">
              {presetMultipliers.map(m => (
                <button type="button"
                  key={m}
                  onClick={() => handlePresetClick(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    multiplier === m && !customInput
                      ? 'bg-amber text-bg scale-105'
                      : 'bg-tint/[0.04] text-cream/60 hover:text-cream hover:bg-tint/[0.08] border border-tint/10'
                  }`}
                >
                  {presetLabels[m]}
                </button>
              ))}
              {/* Custom portion input */}
              <div className="flex items-center gap-1.5 bg-tint/[0.04] border border-tint/10 rounded-lg px-2 py-1">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={customInput}
                  onChange={e => handleCustomInput(e.target.value)}
                  placeholder={lang === 'he' ? 'מנות' : 'qty'}
                  aria-label={lang === 'he' ? 'מספר מנות מותאם אישית' : 'Custom number of servings'}
                  className="w-14 bg-transparent text-cream text-sm text-center outline-none placeholder-cream/30"
                  dir="ltr"
                />
              </div>
            </div>
            {multiplier !== 1 && (
              <span className="text-amber text-sm ms-auto">
                {scaledServings} {lang === 'he' ? 'מנות' : 'servings'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 print:grid-cols-5 gap-6 print:gap-0">
          {/* Ingredients */}
          {displayRecipe.ingredients.length > 0 && <div className="sm:col-span-2 print:col-span-2 card p-5 bg-amber/[0.04] border-amber/10 h-fit print:p-0 print:pe-5 print:border-0 print:border-e print:border-tint/20 print:bg-transparent print:rounded-none">
            <h2 id="ingredients-heading" className="font-serif text-xl font-bold text-cream mb-4 scroll-mt-20">{tx.ingredients}</h2>
            <div className="space-y-4">
              {displayRecipe.ingredients.map((group, gi) => {
                const groupLabel = lang === 'he' ? (group.group || group.groupEn) : (group.groupEn || group.group)
                return (
                  <div key={gi}>
                    {groupLabel && (
                      <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-2">
                        {groupLabel}
                      </h3>
                    )}
                    <ul className="space-y-2">
                      {group.items.map((item, ii) => {
                        const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
                        const itemNote = lang === 'he' ? item.note : (item.noteEn ?? item.note)
                        const ingredientKey = `${gi}-${ii}`
                        const checked = checkedIngredients.has(ingredientKey)
                        return (
                          <li
                            key={ii}
                            onClick={() => toggleIngredient(ingredientKey)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleIngredient(ingredientKey)
                              }
                            }}
                            role="checkbox"
                            aria-checked={checked}
                            tabIndex={0}
                            className="flex gap-2 text-sm cursor-pointer"
                            dir={lang === 'he' ? 'rtl' : 'ltr'}
                          >
                            <span
                              className={`print:hidden shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors ${
                                checked ? 'bg-herb border-herb text-white' : 'border-tint/20 text-transparent'
                              }`}
                            >
                              {checked && '✓'}
                            </span>
                            <span className="hidden print:inline shrink-0 mt-0.5">•</span>
                            <span className={`font-semibold shrink-0 w-14 text-right transition-colors ${checked ? 'text-cream/30 line-through' : 'text-cream/90'}`} dir={lang === 'he' ? 'rtl' : 'ltr'}>
                              {(() => {
                                if (!item.amount) return null
                                const scaled = item.amount * multiplier
                                const amt = scaleAmount(item.amount, multiplier)
                                const unit = lang === 'he' ? heUnit(item.unit, scaled) : item.unit
                                if (!unit) return amt
                                return `${amt} ${unit}`
                              })()}
                            </span>
                            <span className={`transition-colors ${checked ? 'text-cream/30 line-through' : 'text-cream/70'}`}>
                              {itemName}
                              {itemNote && <span className="text-cream/40 italic"> ({itemNote})</span>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>}

          {/* Steps */}
          <div className="sm:col-span-3 print:col-span-3 print:ps-5">
            <div className="flex items-center justify-between mb-4">
              <h2 id="steps-heading" className="font-serif text-xl font-bold text-cream scroll-mt-20">{tx.instructions}</h2>
              <div className="print:hidden flex items-center gap-2">
                {flatSteps.length > 0 && (
                  <button type="button"
                    onClick={openWizard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 text-cream/40 hover:text-cream/70 transition-colors"
                    title={lang === 'he' ? 'הדריכו אותי שלב אחר שלב' : 'Guide me step by step'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {lang === 'he' ? 'מצב הדרכה' : 'Guided mode'}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-6">
              {displayRecipe.steps.map((group, gi) => {
                const groupTitle = lang === 'he' ? (group.title || group.titleEn) : (group.titleEn || group.title)
                return (
                  <div key={gi}>
                    {groupTitle && (
                      <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-3">
                        {groupTitle}
                      </h3>
                    )}
                    <div className="space-y-3">
                      {group.items.map((step, si) => {
                        const stepKey = `${gi}-${si}`
                        const checked = checkedSteps.has(stepKey)
                        const existingTimer = getTimerForStep(gi, si)
                        const stepNum = stepNums[gi][si]
                        const instruction = lang === 'he'
                          ? step.instruction
                          : (step.instructionEn ?? step.instruction)
                        const tip = lang === 'he' ? step.tip : (step.tipEn ?? step.tip)

                        return (
                          <motion.div
                            key={si}
                            layout
                            className={`relative rounded-xl border p-4 transition-colors cursor-pointer print:rounded-none print:border-0 print:bg-transparent print:p-0 print:pb-3 print:break-inside-avoid ${
                              checked
                                ? 'border-herb/30 bg-herb/5'
                                : 'border-tint/5 bg-tint/[0.02] hover:border-tint/10'
                            }`}
                            onClick={() => toggleStep(stepKey)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleStep(stepKey)
                              }
                            }}
                            role="checkbox"
                            aria-checked={checked}
                            tabIndex={0}
                          >
                            <div className="flex gap-3">
                              <div className={`shrink-0 w-9 h-9 print:w-7 print:h-7 rounded-full flex items-center justify-center text-base print:text-sm font-bold transition-colors ${
                                checked ? 'bg-herb text-white' : 'bg-amber text-bg'
                              }`}>
                                {checked ? '✓' : stepNum}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`leading-relaxed text-sm transition-colors ${
                                    checked ? 'text-cream/40 line-through' : 'text-cream/80'
                                  }`}
                                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                                >
                                  {instruction}
                                </p>

                                {step.image && (
                                  <img
                                    src={step.image}
                                    alt=""
                                    onClick={e => { e.stopPropagation(); setLightboxUrl(step.image!) }}
                                    className="print:hidden mt-2 w-20 h-20 object-cover rounded-lg cursor-zoom-in"
                                  />
                                )}

                                {tip && !checked && (
                                  <p className="mt-2 text-xs text-amber/70 flex items-start gap-1.5">
                                    <span className="mt-0.5">💡</span>
                                    <span dir={lang === 'he' ? 'rtl' : 'ltr'}>{tip}</span>
                                  </p>
                                )}

                                {step.timerMinutes && !checked && (
                                  <p className="hidden print:block mt-2 text-xs text-cream/50">
                                    ⏱ {lang === 'he' ? `${step.timerMinutes} דקות` : `${step.timerMinutes} min`}
                                  </p>
                                )}
                                {step.timerMinutes && !checked && (
                                  <div className="print:hidden mt-3" onClick={e => e.stopPropagation()}>
                                    {existingTimer ? (
                                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
                                        existingTimer.done
                                          ? 'text-herb border-herb/30 bg-herb/10'
                                          : existingTimer.running
                                            ? 'text-amber border-amber/30 bg-amber/10'
                                            : 'text-cream/50 border-tint/20 bg-tint/5'
                                      }`}>
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {existingTimer.done ? tx.timerDone : formatSeconds(existingTimer.remainingSeconds)}
                                      </div>
                                    ) : (
                                      <button type="button"
                                        onClick={() => startTimer(
                                          `${stepNum}: ${instruction.length > 40 ? instruction.slice(0, 40) + '…' : instruction}`,
                                          step.timerMinutes!,
                                          gi, si
                                        )}
                                        className="btn-ghost text-xs flex items-center gap-1.5"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {tx.startTimer(step.timerMinutes)}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tips */}
        {displayTips.length > 0 && (
          <div className="mt-8 card p-5 print:mt-6 print:p-0 print:border-0 print:border-t print:border-tint/15 print:pt-4 print:rounded-none print:bg-transparent print:break-inside-avoid">
            <h2 id="tips-heading" className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2 scroll-mt-20">
              <span>💡</span> {tx.tipsTitle}
            </h2>
            <ul className="space-y-2">
              {displayTips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-cream/70" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                  <span className="text-amber/60 shrink-0 mt-0.5">-</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {displayRecipe.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(lang === 'he' ? displayRecipe.tags : (displayRecipe.tagsEn ?? displayRecipe.tags)).map(tag => (
              <button type="button"
                key={tag}
                onClick={() => navigate(`/?tag=${encodeURIComponent(tag)}`)}
                className="tag hover:text-amber transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Sources - hidden entirely when there are none */}
        {!!displayRecipe.sources?.length && (
          <div className="mt-8 card p-5 print:mt-6 print:p-0 print:border-0 print:border-t print:border-tint/15 print:pt-4 print:rounded-none print:bg-transparent print:break-inside-avoid">
            <h2 className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2">
              <span>🔗</span> {lang === 'he' ? 'מקורות' : 'Sources'}
            </h2>
            <ul className="space-y-1.5">
              {displayRecipe.sources.map(s => (
                <li key={s.url} className="text-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-amber hover:text-amber/80 underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Personal notes */}
        <div className="print:hidden mt-8 card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 id="my-notes-heading" className="font-serif text-lg font-bold text-cream flex items-center gap-2 scroll-mt-20">
              <span>📝</span> {lang === 'he' ? 'ההערות שלי' : 'My Notes'}
              <span className="font-sans text-[11px] font-normal text-cream/30">
                {lang === 'he' ? '(פרטי - גלוי רק לך)' : '(Private — only visible to you)'}
              </span>
            </h2>
            {noteStatus !== 'idle' && (
              <span className="text-xs text-cream/30">
                {noteStatus === 'saving' ? (lang === 'he' ? 'שומר...' : 'Saving...') : (lang === 'he' ? 'נשמר' : 'Saved')}
              </span>
            )}
          </div>
          <textarea
            aria-labelledby="my-notes-heading"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onBlur={() => saveNote(noteInput)}
            placeholder={lang === 'he' ? 'הוסף הערה פרטית למתכון הזה...' : 'Add a private note for this recipe...'}
            rows={3}
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-3 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
        </div>

        {/* Reviews */}
        {isViewingPublishedContent && (
        <div className="print:hidden mt-8 card p-5">
          <h2 id="reviews-heading" className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2 scroll-mt-20">
            <span>💬</span> {lang === 'he' ? 'ביקורות' : 'Reviews'}
          </h2>
          {!!recipe.ratingCount && distribution && (
            <div className="flex flex-col gap-1 mb-4">
              {([5, 4, 3, 2, 1] as const).map(star => {
                const count = distribution[star]
                const pct = recipe.ratingCount ? Math.round((count / recipe.ratingCount) * 100) : 0
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-cream/40 shrink-0">{star} ★</span>
                    <div className="flex-1 h-1.5 rounded-full bg-tint/[0.06] overflow-hidden">
                      <div className="h-full bg-amber/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-cream/30 text-right shrink-0">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
          {hasPostedReview && !isEditingReview ? (
            <div className="flex flex-col gap-2 mb-4 border border-tint/10 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cream/40">
                  {lang === 'he' ? 'הביקורת שלכם' : 'Your review'}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button"
                    onClick={() => setIsEditingReview(true)}
                    aria-label={lang === 'he' ? 'ערוך ביקורת' : 'Edit review'}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button type="button"
                    onClick={deleteMyReview}
                    aria-label={lang === 'he' ? 'מחק ביקורת' : 'Delete review'}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-sm text-cream/70 leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                {reviewComment}
              </p>
              {reviewPhotoUrl && (
                <img
                  src={reviewPhotoUrl}
                  alt=""
                  onClick={() => setLightboxUrl(reviewPhotoUrl)}
                  className="w-24 h-24 object-cover rounded-lg cursor-zoom-in"
                />
              )}
            </div>
          ) : (
          <div className="flex flex-col gap-2 mb-4">
            <textarea
              aria-labelledby="reviews-heading"
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder={
                userRating
                  ? (lang === 'he' ? 'שתפו מה חשבתם על המתכון...' : 'Share your thoughts on this recipe...')
                  : (lang === 'he' ? 'דרגו את המתכון בכוכבים כדי לכתוב ביקורת' : 'Rate the recipe with stars above to write a review')
              }
              rows={2}
              maxLength={500}
              disabled={!userRating}
              className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-3 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none disabled:opacity-50"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            />
            {reviewPhotoUrl && (
              <div className="relative w-24 h-24">
                <img
                  src={reviewPhotoUrl}
                  alt=""
                  onClick={() => setLightboxUrl(reviewPhotoUrl)}
                  className="w-full h-full object-cover rounded-lg cursor-zoom-in"
                />
                <button type="button"
                  onClick={() => setReviewPhotoUrl(null)}
                  aria-label={lang === 'he' ? 'הסר תמונה' : 'Remove photo'}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] hover:bg-black/80"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 transition-colors ${
                userRating ? 'text-cream/40 hover:text-cream/70 cursor-pointer' : 'text-cream/20 cursor-not-allowed'
              }`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {reviewPhotoUploading
                  ? (lang === 'he' ? 'מעלה...' : 'Uploading...')
                  : reviewPhotoUrl
                    ? (lang === 'he' ? 'החלף תמונה' : 'Replace photo')
                    : (lang === 'he' ? 'הוסף תמונה' : 'Add photo')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  disabled={!userRating || reviewPhotoUploading}
                  className="hidden"
                />
              </label>
              <button type="button"
                onClick={postReview}
                disabled={!userRating || !reviewComment.trim() || reviewPhotoUploading}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {hasPostedReview
                  ? (lang === 'he' ? 'עדכן ביקורת' : 'Update review')
                  : (lang === 'he' ? 'פרסם ביקורת' : 'Post review')}
              </button>
            </div>
          </div>
          )}
          {(() => {
            const otherReviews = reviews.filter(r => r.userId !== currentUserId)
            return otherReviews.length > 0 ? (
            <ul className="space-y-4">
              {otherReviews.map(r => (
                <ReviewItem
                  key={r.id}
                  recipeId={id!}
                  review={r}
                  lang={lang}
                  getToken={getToken}
                  onOpenLightbox={setLightboxUrl}
                  translation={translations[r.userId]}
                  onToggleTranslate={() => toggleTranslateReview(r.userId, r.comment)}
                  liveRevision={recipe.publishedRevision ?? undefined}
                />
              ))}
            </ul>
            ) : (
              <p className="text-xs text-cream/25">
                {hasPostedReview
                  ? (lang === 'he' ? 'אין עדיין ביקורות נוספות' : 'No other reviews yet')
                  : (lang === 'he' ? 'אין עדיין ביקורות. היו הראשונים!' : 'No reviews yet. Be the first!')}
              </p>
            )
          })()}
        </div>
        )}

        {/* Revision history - hidden while a submission is under review, since
            there's exactly one candidate version to look at in that moment */}
        {!!recipe.currentRevision && recipe.status !== 'pending_review' && (
          <div className="print:hidden mt-6">
            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => { setRevisionsOpen(v => !v); if (!revisionsOpen && revisions === null) loadRevisions() }}
                className="flex items-center gap-1 text-xs font-medium text-cream/35 hover:text-cream/60 transition-colors"
              >
                <span>{lang === 'he' ? 'היסטוריית גרסאות' : 'Show revision history'}</span>
                <svg className={`w-3 h-3 transition-transform ${revisionsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {viewingRevision && viewingRevision.revisionNumber !== (canEdit ? recipe.currentRevision : recipe.publishedRevision) && (
                <button type="button"
                  onClick={() => selectRevision(null)}
                  className="text-xs font-semibold text-amber hover:text-amber/80 transition-colors"
                >
                  {lang === 'he' ? 'חזרה לגרסה הנוכחית' : 'Back to current version'}
                </button>
              )}
            </div>
            {revisionsOpen && revisions && (
              revisions.length === 0 ? (
                <p className="mt-3 text-xs text-cream/25">
                  {lang === 'he' ? 'אין עדיין גרסאות' : 'No revisions yet'}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {revisions.map(rev => {
                    // Owners/admins default to their latest saved revision
                    // (which may not be published yet); everyone else
                    // defaults to whatever is actually live on the site.
                    const isLatest = rev.revisionNumber === (canEdit ? recipe.currentRevision : recipe.publishedRevision)
                    const isLive = rev.revisionNumber === recipe.publishedRevision
                    const isSelected = viewingRevision?.revisionNumber === rev.revisionNumber
                    // The revision currently shown is either the explicitly
                    // selected one, or - when nothing is selected - whichever
                    // one displayRecipe falls back to (the latest).
                    const isShown = isSelected || (!viewingRevision && isLatest)
                    const isRejectedAttempt = isLatest && !isLive && recipe.status === 'rejected'
                    return (
                      <li key={rev.revisionNumber}>
                        <button type="button"
                          onClick={() => selectRevision(isSelected ? null : rev)}
                          className={`card w-full p-3 text-xs text-cream/50 flex items-center justify-between gap-2 text-start transition-colors ${
                            isShown ? 'border border-amber/50' : ''
                          }`}
                        >
                          <span>
                            <span className="font-semibold text-cream/70">v{rev.revisionNumber}</span>
                            {' · '}
                            {new Date(rev.publishedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                            {' · '}
                            {(rev.snapshot.title as string) ?? ''}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {isLive && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-herb/10 text-herb">
                                {lang === 'he' ? 'חי באתר' : 'Live on site'}
                              </span>
                            )}
                            {isRejectedAttempt && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                                {lang === 'he' ? 'נדחה' : 'Rejected'}
                              </span>
                            )}
                            {isLatest && !isLive && !isRejectedAttempt && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber/10 text-amber">
                                {lang === 'he' ? 'הגרסה האחרונה' : 'Latest'}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            )}
          </div>
        )}

        {/* Related recipes */}
        {relatedRecipes.length > 0 && (
          <div className="print:hidden mt-10">
            <h2 className="font-serif text-lg font-bold text-cream mb-4">
              {lang === 'he' ? 'מתכונים דומים' : 'You might also like'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {relatedRecipes.map(r => {
                const title = lang === 'he' ? (r.titleHe ?? r.title) : r.title
                return (
                  <Link key={r.id} to={`/recipes/${r.id}`} className="group">
                    <div className="relative h-24 rounded-xl overflow-hidden mb-2">
                      {r.image?.includes('assets.tugy.dev') ? (
                        <img
                          src={r.image}
                          alt={title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-tint/[0.05] flex items-center justify-center text-2xl">
                          {categoryEmoji[r.category]}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-cream/70 group-hover:text-amber transition-colors line-clamp-2" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                      {title}
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Guided step-by-step wizard */}
      {wizardOpen && flatSteps.length > 0 && (() => {
        const step = flatSteps[wizardIndex]
        const stepKey = `${step.groupIdx}-${step.stepIdx}`
        const checked = checkedSteps.has(stepKey)
        const existingTimer = getTimerForStep(step.groupIdx, step.stepIdx)
        return (
          <div
            ref={wizardRef}
            role="dialog"
            aria-modal="true"
            className="print:hidden fixed inset-0 z-[60] bg-bg flex flex-col"
            style={timerBarHeight > 0 ? { paddingBottom: timerBarHeight } : undefined}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-tint/[0.06]">
              <span className="text-cream/40 text-sm">
                {lang === 'he' ? `שלב ${wizardIndex + 1} מתוך ${flatSteps.length}` : `Step ${wizardIndex + 1} of ${flatSteps.length}`}
              </span>
              <button type="button"
                onClick={() => setWizardOpen(false)}
                aria-label={lang === 'he' ? 'סגור מצב הדרכה' : 'Close guided mode'}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="h-1 bg-tint/[0.06]">
              <div className="h-full bg-amber transition-all" style={{ width: `${((wizardIndex + 1) / flatSteps.length) * 100}%` }} />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6 overflow-y-auto py-8">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
                checked ? 'bg-herb text-white' : 'bg-tint/10 text-cream/60'
              }`}>
                {checked ? '✓' : step.stepNum}
              </div>
              <p className="max-w-lg text-xl sm:text-2xl leading-relaxed text-cream">
                {step.instruction}
              </p>
              {step.image && (
                <img
                  src={step.image}
                  alt=""
                  onClick={() => setLightboxUrl(step.image!)}
                  className="max-w-xs w-full max-h-52 object-cover rounded-xl cursor-zoom-in"
                />
              )}
              {step.tip && (
                <p className="max-w-md text-sm text-amber/70 flex items-start gap-1.5">
                  <span className="mt-0.5">💡</span>
                  <span>{step.tip}</span>
                </p>
              )}
              <div className="flex items-center gap-3">
                {step.timerMinutes && !existingTimer && (
                  <button type="button"
                    onClick={() => startTimer(step.instruction.slice(0, 40), step.timerMinutes!, step.groupIdx, step.stepIdx)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-amber/10 border border-amber/30 text-amber hover:bg-amber/20 transition-colors"
                  >
                    ⏱ {lang === 'he' ? `התחל טיימר ${step.timerMinutes} דק'` : `Start ${step.timerMinutes}m timer`}
                  </button>
                )}
                <button type="button"
                  onClick={() => handleWizardMarkDone(stepKey)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    checked ? 'border-herb/30 bg-herb/10 text-herb' : 'border-tint/10 text-cream/50 hover:text-cream/80'
                  }`}
                >
                  {checked ? (lang === 'he' ? '✓ הושלם' : '✓ Done') : (lang === 'he' ? 'סמן כהושלם' : 'Mark done')}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-tint/[0.06]">
              <button type="button"
                onClick={() => setWizardIndex(i => Math.max(i - 1, 0))}
                disabled={wizardIndex === 0}
                className="flex-1 py-3 rounded-xl text-sm font-medium border border-tint/10 text-cream/60 hover:text-cream/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {lang === 'he' ? 'הקודם' : 'Previous'}
              </button>
              {wizardIndex === flatSteps.length - 1 ? (
                <button type="button"
                  onClick={() => { markStepChecked(stepKey); setWizardOpen(false) }}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors"
                >
                  {lang === 'he' ? 'סיום' : 'Finish'}
                </button>
              ) : (
                <button type="button"
                  onClick={() => { markStepChecked(stepKey); advanceWizardOrFinish() }}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors"
                >
                  {lang === 'he' ? 'הבא' : 'Next'}
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* Photo lightbox */}
      {lightboxUrl && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          className="print:hidden fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label={lang === 'he' ? 'סגור' : 'Close'}
            className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={lang === 'he' ? 'מחיקת מתכון' : 'Delete recipe'}
        message={lang === 'he' ? 'למחוק את המתכון הזה לצמיתות? לא ניתן לבטל פעולה זו.' : 'Permanently delete this recipe? This cannot be undone.'}
        confirmLabel={deleting ? (lang === 'he' ? 'מוחק...' : 'Deleting...') : (lang === 'he' ? 'מחק' : 'Delete')}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        danger
        busy={deleting}
        onConfirm={handleDeleteRecipe}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmDialog
        open={publishConfirmOpen}
        title={lang === 'he' ? 'פרסום מתכון' : 'Publish recipe'}
        message={lang === 'he'
          ? 'לשלוח את המתכון לבדיקת AI ולפרסום? הבדיקה בודקת איכות, תמונה, תרגום ועוד.'
          : 'Publish this recipe for AI review? The review checks quality, photo, translation, and more.'}
        confirmLabel={lang === 'he' ? 'פרסם' : 'Publish'}
        cancelLabel={lang === 'he' ? 'ביטול' : 'Cancel'}
        busy={submitting}
        onConfirm={() => { setPublishConfirmOpen(false); handleSubmitForReview() }}
        onCancel={() => setPublishConfirmOpen(false)}
      />
    </div>
  )
}
