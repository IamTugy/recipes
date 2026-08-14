import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import RecipePlaceholder from './RecipePlaceholder'
import LinkedIngredientName from './LinkedIngredientName'
import RecipeDetailSkeleton from './RecipeDetailSkeleton'
import Breadcrumbs from './Breadcrumbs'
import RecipeSectionNav from './RecipeSectionNav'
import FilterInfoPopover from './FilterInfoPopover'
import { useTranslatedReview } from '../hooks/useTranslatedReview'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { useRecipe, useRecipes, deleteRecipe, submitForReview, disputeDuplicate } from '../hooks/useRecipes'
import { OWNER_USER_ID } from '../lib/admin'
import { ApiError, apiFetch } from '../lib/api'
import { useWakeLock } from '../hooks/useWakeLock'
import { useFavorites } from '../hooks/useFavorites'
import { useCollections } from '../hooks/useCollections'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { useNote } from '../hooks/useNote'
import { useTranslatedRecipe } from '../hooks/useTranslatedRecipe'
import { useAuth } from '@clerk/react'
import { formatTime, formatSeconds, scaleAmount } from '../utils/format'
import { t, categoryEmoji, heUnit, canonicalUnit, difficultyColor } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import ReviewItem, { type Review } from './ReviewItem'
import ConfirmDialog from './ConfirmDialog'
import type { TimerState, RecipeRevision, QualityReview } from '../types'
import { resizedImage } from '../lib/image'
import { downloadRecipePdf } from '../lib/recipePdf'
import {
  startCookSession, logCookSessionStep, finishCookSession, abandonCookSession,
  getActiveCookSession, syncCookSession, getCurrentCookSession,
} from '../lib/cookSessions'
import SkeletonImage from './SkeletonImage'
import { useTranslatedText } from '../hooks/useTranslatedText'
import TranslatedText from './TranslatedText'
import BackgroundCookStatus, { type BackgroundCookStatusHandle } from './BackgroundCookStatus'
import CookDock from './CookDock'

interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  onToggleTimer: (id: string) => void
  timers: TimerState[]
  timerBarHeight: number
  onAddToShoppingList: (items: { name: string; amount: number | null; unit: string }[]) => void
}

const presetMultipliers = [0.5, 1, 1.5, 2, 3, 4]
const presetLabels: Record<number, string> = { 0.5: '½x', 1: '1x', 1.5: '1.5x', 2: '2x', 3: '3x', 4: '4x' }

function sameStringSet(a: string[], b: Set<string>): boolean {
  if (a.length !== b.size) return false
  return a.every(item => b.has(item))
}

export default function RecipeDetail({ onAddTimer, onToggleTimer, timers, timerBarHeight, onAddToShoppingList }: RecipeDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { recipe, loading: recipeLoading, reload: reloadRecipe } = useRecipe(id)
  const { recipes: allRecipes } = useRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { collections, create: createCollection, addRecipe: addRecipeToCollection, removeRecipe: removeRecipeFromCollection } = useCollections()
  // Drives the persistent CookDock, the wake lock, and the PiP/notification
  // hand-off together - true for the whole cook session, independent of
  // whether the dock is currently collapsed or expanded.
  const [cookSessionActive, setCookSessionActive] = useState(false)
  // Backend cook-session id for the in-progress session (Phase C) - null
  // whenever there's no session, the user is signed out, or the start
  // call hasn't resolved/failed silently. Every call site below already
  // treats a null id as "skip the network call", so anonymous cooking is
  // unaffected.
  const [cookSessionId, setCookSessionId] = useState<string | null>(null)
  const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)
  // Only true for the render right after a fresh "Start cooking" click -
  // reset immediately after CookDock reads it, so cross-device resume
  // (Phase D) and the discovery/polling effects never force-expand an
  // already-collapsed dock.
  const [startDockExpanded, setStartDockExpanded] = useState(false)
  const [cookConflict, setCookConflict] = useState<{ sessionId: string; recipeTitle: string } | null>(null)
  const [resolvingCookConflict, setResolvingCookConflict] = useState(false)
  const pendingCookStepRef = useRef<{ stepKey: string; stepNum: number } | null>(null)
  // Tracks the last stepKey/stepNum passed to handleStepEntered (including
  // 'checklist') so the checked-state-only sync effect below can include
  // it without RecipeDetail needing to know CookDock's internal screen
  // state directly.
  const lastEnteredStepRef = useRef<{ stepKey: string; stepNum: number }>({ stepKey: 'checklist', stepNum: 0 })
  const suppressNextCheckedSyncRef = useRef(false)
  const [wizardIndex, setWizardIndex] = useState(0)
  // The overflow menu (Edit/Delete/Save to collection/Download PDF/Copy
  // link) consolidates what used to be scattered separate buttons. It's a
  // single sheet with two "views" - the root list, and a collections
  // sub-view - rather than a separate popover per action.
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [actionsMenuView, setActionsMenuView] = useState<'root' | 'collections'>('root')
  const [newCollectionName, setNewCollectionName] = useState('')
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuDragControls = useDragControls()
  // Below sm (640px) the menu renders as a bottom sheet (slide up/down,
  // drag-to-dismiss via the handle); at sm and above it's an anchored
  // dropdown (fade/rise, no drag) - same markup, different motion values.
  const [isMobileMenu, setIsMobileMenu] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = () => setIsMobileMenu(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  function closeActionsMenu() {
    setActionsMenuOpen(false)
    setActionsMenuView('root')
  }

  useEffect(() => {
    if (!actionsMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        closeActionsMenu()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeActionsMenu()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [actionsMenuOpen])
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
  const checkedStepsRef = useRef(checkedSteps)
  const checkedIngredientsRef = useRef(checkedIngredients)
  const wizardIndexRef = useRef(wizardIndex)
  useEffect(() => { checkedStepsRef.current = checkedSteps }, [checkedSteps])
  useEffect(() => { checkedIngredientsRef.current = checkedIngredients }, [checkedIngredients])
  useEffect(() => { wizardIndexRef.current = wizardIndex }, [wizardIndex])
  const [userRating, setUserRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
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
        ? (tx.reviewUpdated)
        : (tx.reviewPosted)
    )
  }

  async function deleteMyReview() {
    const confirmMsg = tx.deleteYourReview
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
    showToast(tx.reviewDeleted)
  }

  // Route through /share/recipes/:id instead of the page's own hash URL -
  // link-preview crawlers (WhatsApp, iMessage, Slack) don't run JS, so they
  // need a server-rendered page with this recipe's own og:image/og:title.
  // Carry the currently-viewed revision along too, so sharing an older
  // version previews and links to that version, not whatever's live now.
  // When sharing the live version, tack on the published revision number -
  // crawlers cache previews per exact URL, so without this, editing a
  // recipe's photo/title after it's been shared once would leave every
  // future share stuck showing the old preview forever.
  function getShareUrl() {
    const shareQuery = viewingRevision
      ? `?rev=${viewingRevision.id}`
      : recipe?.publishedRevision != null ? `?v=${recipe.publishedRevision}` : ''
    return id
      ? `${window.location.origin}/share/recipes/${id}${shareQuery}`
      : window.location.href
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(getShareUrl())
      showToast(tx.copied)
    } catch { /* clipboard unavailable */ }
  }

  async function shareNative() {
    // Not every browser implements the Web Share API (most desktop browsers
    // don't) - falling back to a plain clipboard copy means the "Share"
    // item always does something useful instead of silently not rendering.
    if (!navigator.share) {
      await copyShareLink()
      return
    }
    try {
      await navigator.share({ title: displayTitle, text: displayDescription, url: getShareUrl() })
    } catch { /* user cancelled */ }
  }

  async function handleDownloadPdf() {
    if (!displayRecipe) return
    setPdfGenerating(true)
    try {
      await downloadRecipePdf(displayRecipe, lang, multiplier)
    } catch {
      showToast(tx.pdfGenerationFailed, 'error')
    } finally {
      setPdfGenerating(false)
    }
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
      showToast(tx.recipeDeleted)
    } catch (err) {
      const message = err instanceof ApiError && err.status === 403
        ? (tx.youDonTHavePermissionTo)
        : (tx.failedToDeleteTheRecipePlease)
      showToast(message, 'error')
    } finally {
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  const [submitting, setSubmitting] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const [disputeFormOpen, setDisputeFormOpen] = useState(false)
  const [disputeMessageInput, setDisputeMessageInput] = useState('')
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
          ? (tx.recipePublished)
          : (tx.recipeDidnTPassReview),
        result.status === 'published' ? 'success' : 'error'
      )
      await reloadRecipe()
    } catch (err) {
      // The missing-fields message is a list the user needs time to read and
      // act on - a 3s toast disappears before they can even finish reading
      // it. Keep it pinned near the Submit button until they dismiss it or
      // try again.
      const message = err instanceof ApiError ? err.message : (tx.submissionFailed)
      setSubmitError(message)
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDisputeDuplicate() {
    if (!id) return
    setDisputing(true)
    try {
      await disputeDuplicate(id, disputeMessageInput.trim() || undefined, getToken)
      showToast(tx.disputeSubmitted, 'success')
      setDisputeFormOpen(false)
      setDisputeMessageInput('')
      await reloadRecipe()
    } catch {
      showToast(tx.submissionFailed, 'error')
    } finally {
      setDisputing(false)
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
    setCookSessionActive(false)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
  }, [id])

  // Cross-device resume (Phase D): on loading a recipe, check whether the
  // signed-in user already has an active cook session for it elsewhere -
  // if so, silently resume into it (no prompt, per design - this applies
  // identically whether reached by page load or by clicking "Start
  // cooking" again on the same recipe) instead of the sessionStorage-only
  // restore above.
  useEffect(() => {
    if (!id || !currentUserId) return
    let cancelled = false
    getActiveCookSession(id, getToken).then(session => {
      if (cancelled || !session) return
      if (!sameStringSet(session.checkedSteps, checkedStepsRef.current)) {
        setCheckedSteps(new Set(session.checkedSteps))
      }
      if (!sameStringSet(session.checkedIngredients, checkedIngredientsRef.current)) {
        setCheckedIngredients(new Set(session.checkedIngredients))
      }
      const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
        ? Math.max(0, session.currentStepNum - 1)
        : 0
      if (resumedIndex !== wizardIndexRef.current) {
        setWizardIndex(resumedIndex)
      }
      lastEnteredStepRef.current = session.currentStepKey
        ? { stepKey: session.currentStepKey, stepNum: session.currentStepNum }
        : { stepKey: 'checklist', stepNum: 0 }
      setCookSessionId(session.sessionId)
      setCookSessionStartedAt(session.startedAt)
      setCookSessionActive(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render from useAuth(); checkedSteps/checkedIngredients/wizardIndex are read via closure for comparison only (not to trigger the effect), so exclusion is intentional
  }, [id, currentUserId])

  // While a session is active, poll for changes made from another device
  // (Phase D) - server-wins on every tick, no merge logic.
  useEffect(() => {
    if (!cookSessionActive || !id || !currentUserId) return
    let cancelled = false
    const interval = setInterval(() => {
      getActiveCookSession(id, getToken).then(session => {
        if (cancelled || !session) return
        if (!sameStringSet(session.checkedSteps, checkedStepsRef.current)) {
          setCheckedSteps(new Set(session.checkedSteps))
        }
        if (!sameStringSet(session.checkedIngredients, checkedIngredientsRef.current)) {
          setCheckedIngredients(new Set(session.checkedIngredients))
        }
        const resumedIndex = session.currentStepKey && session.currentStepKey !== 'checklist'
          ? Math.max(0, session.currentStepNum - 1)
          : 0
        if (resumedIndex !== wizardIndexRef.current) {
          setWizardIndex(resumedIndex)
        }
      })
    }, 5000)
    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render; checkedSteps/checkedIngredients/wizardIndex are read via closure for comparison only (not to trigger the effect), so exclusion is intentional
  }, [cookSessionActive, id, currentUserId])

  // Push checked-state changes to the backend session (Phase D) even when
  // they happen without a step transition (e.g. ticking an ingredient
  // while staying on the checklist screen) - step-transition-triggered
  // syncs are already covered inside handleStepEntered above.
  useEffect(() => {
    if (!cookSessionId) return
    if (suppressNextCheckedSyncRef.current) {
      suppressNextCheckedSyncRef.current = false
      return
    }
    const { stepKey, stepNum } = lastEnteredStepRef.current
    syncCookSession(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is a new function every render; this effect should only re-fire on an actual checked-state change, not on every render
  }, [checkedSteps, checkedIngredients])

  // Track this recipe as recently viewed once it has loaded
  useEffect(() => {
    if (recipe) addRecent(recipe.id)
  }, [recipe, addRecent])

  const backgroundCookStatusRef = useRef<BackgroundCookStatusHandle>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  useFocusTrap(lightboxRef, !!lightboxUrl)
  useFocusTrap(actionsMenuRef, actionsMenuOpen)

  useEffect(() => {
    if (cookSessionActive) void cookMode.request()
    else void cookMode.release()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cookMode is a new object every render; request/release are individually stable
  }, [cookSessionActive, cookMode.request, cookMode.release])

  // Auto-enter/exit the floating PiP view as the app is backgrounded and
  // foregrounded - the dock itself is always present in-page while a
  // session is active, so there's nothing to "restore" here beyond exiting
  // PiP; entering PiP on hide is the only action needed on that side.
  useEffect(() => {
    if (!cookSessionActive) return
    function handleVisibility() {
      if (document.hidden) backgroundCookStatusRef.current?.enterFloatingView()
      else backgroundCookStatusRef.current?.exitFloatingView()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [cookSessionActive])

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

  // Same "compute unconditionally before any early return" rule - these
  // must run every render regardless of whether recipe/displayRecipe have
  // loaded yet.
  const { text: displayTitle, loading: titleLoading } = useTranslatedText(
    lang === 'he' ? displayRecipe?.titleHe : displayRecipe?.title,
    lang === 'he' ? displayRecipe?.title : displayRecipe?.titleHe,
  )
  const { text: displayDescription, loading: descriptionLoading } = useTranslatedText(
    lang === 'he' ? displayRecipe?.description : displayRecipe?.descriptionEn,
    lang === 'he' ? displayRecipe?.descriptionEn : displayRecipe?.description,
  )

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


  // tips/tipsEn are parallel arrays (line N of one corresponds to line N of
  // the other, same as how they're edited in RecipeForm) - the longer of
  // the two decides how many rows to render, and each row is translated
  // independently via TranslatedText below if its own-language line is
  // missing.
  const displayTipsCount = Math.max(displayRecipe.tips?.length ?? 0, displayRecipe.tipsEn?.length ?? 0)

  const relatedRecipes = allRecipes
    .filter(r => r.id !== recipe.id && r.category === displayRecipe.category && !r.hidden)
    .slice(0, 4)

  function addAllToShoppingList() {
    const items = displayRecipe!.ingredients.flatMap(group =>
      group.items
        // A linked ingredient represents "make this other recipe as a
        // component," not a literal item to buy - it has no name to shop
        // for, and its own ingredients aren't pulled in transitively here.
        .filter(item => !item.linkedRecipeId)
        .map(item => {
          const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
          // Normalize to the canonical unit code (not whatever the recipe
          // happened to store) so aggregation groups matching units
          // together and the shopping list can localize it correctly.
          const unit = canonicalUnit(item.unit)
          if (!item.amount) return { name: itemName, amount: null, unit }
          return { name: itemName, amount: item.amount * multiplier, unit }
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
      if (cookSessionId) {
        finishCookSession(cookSessionId, getToken)
        setCookSessionId(null)
      }
      setCookSessionActive(false)
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
      instructionHe: step.instruction,
      instructionEn: step.instructionEn,
      tip: lang === 'he' ? step.tip : (step.tipEn ?? step.tip),
      timerMinutes: step.timerMinutes,
      image: step.image,
    }))
  )

  // Most urgent timer for this recipe - what a backgrounded notification/PiP widget should show.
  const recipeTimers = timers.filter(t => t.recipeId === recipe?.id && !t.done)
  const runningRecipeTimers = recipeTimers.filter(t => t.running)
  const nearestTimer = (runningRecipeTimers.length > 0 ? runningRecipeTimers : recipeTimers)
    .slice().sort((a, b) => a.remainingSeconds - b.remainingSeconds)[0] ?? null

  // Feeds both the CookDock and the PiP/notification widget, so it must
  // keep reflecting the current step for the whole session regardless of
  // whether the dock is collapsed, expanded, or backgrounded into PiP.
  const currentWizardStep = cookSessionActive ? flatSteps[wizardIndex] : undefined
  const wizardStepLabel = lang === 'he'
    ? `שלב ${wizardIndex + 1} מתוך ${flatSteps.length}`
    : `Step ${wizardIndex + 1} of ${flatSteps.length}`

  function openWizard() {
    if (cookSessionActive) return
    void startCookingWithConflictCheck()
  }

  async function startCookingWithConflictCheck() {
    if (currentUserId) {
      const current = await getCurrentCookSession(getToken)
      if (current && current.recipeId !== id) {
        setCookConflict({ sessionId: current.sessionId, recipeTitle: current.recipeTitle })
        return
      }
    }
    startCookingNow()
  }

  function startCookingNow() {
    const firstUnchecked = flatSteps.findIndex(s => !checkedSteps.has(`${s.groupIdx}-${s.stepIdx}`))
    const startIndex = firstUnchecked === -1 ? 0 : firstUnchecked
    setWizardIndex(startIndex)
    setCookSessionActive(true)
    setStartDockExpanded(true)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
    pendingCookStepRef.current = null
    lastEnteredStepRef.current = { stepKey: 'checklist', stepNum: 0 }
    if (currentUserId && recipe) {
      startCookSession(recipe.id, getToken).then(id => {
        setCookSessionId(id)
        if (!id) return
        // Mirrors CookDock's own screen-selection logic: if every
        // ingredient is already checked, the dock mounts directly on the
        // "steps" screen and (by design) never calls onStepEntered for
        // that initial step on mount - log it here instead so a fresh
        // session that skips the checklist doesn't silently miss step 1
        // in its timeline.
        const allIngredientsChecked = (displayRecipe?.ingredients ?? []).every((group, gi) =>
          group.items.every((_, ii) => checkedIngredients.has(`${gi}-${ii}`))
        )
        const initialStep = flatSteps[startIndex]
        if (allIngredientsChecked && initialStep) {
          const stepKey = `${initialStep.groupIdx}-${initialStep.stepIdx}`
          lastEnteredStepRef.current = { stepKey, stepNum: initialStep.stepNum }
          logCookSessionStep(id, stepKey, initialStep.stepNum, [...checkedSteps], [...checkedIngredients], getToken)
        } else if (pendingCookStepRef.current) {
          const { stepKey, stepNum } = pendingCookStepRef.current
          pendingCookStepRef.current = null
          logCookSessionStep(id, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
        }
      })
    }
  }

  async function confirmStartNewCook() {
    if (!cookConflict) return
    setResolvingCookConflict(true)
    await abandonCookSession(cookConflict.sessionId, getToken)
    setResolvingCookConflict(false)
    setCookConflict(null)
    startCookingNow()
  }

  function pipToggleNearestTimer() {
    if (nearestTimer) onToggleTimer(nearestTimer.id)
  }

  function pipPreviousStep() {
    setWizardIndex(i => Math.max(i - 1, 0))
  }

  function pipNextStep() {
    if (!currentWizardStep) return
    markStepChecked(`${currentWizardStep.groupIdx}-${currentWizardStep.stepIdx}`)
    advanceWizardOrFinish()
  }

  function stopCooking() {
    if (cookSessionId) {
      abandonCookSession(cookSessionId, getToken)
      setCookSessionId(null)
    }
    setCookSessionStartedAt(null)
    setCookSessionActive(false)
    backgroundCookStatusRef.current?.exitFloatingView()
  }

  function handleStepEntered(stepKey: string, stepNum: number) {
    lastEnteredStepRef.current = { stepKey, stepNum }
    if (!cookSessionId) {
      pendingCookStepRef.current = { stepKey, stepNum }
      return
    }
    // logCookSessionStep already atomically writes the checked-state
    // snapshot alongside the step-entry event server-side - suppress the
    // standalone checked-state sync effect's next firing so it doesn't
    // race that same write with a second concurrent request (this fires
    // when the click that triggered this step change also happened to
    // change checkedSteps, e.g. Next/mark-done both check the current
    // step as they advance).
    suppressNextCheckedSyncRef.current = true
    logCookSessionStep(cookSessionId, stepKey, stepNum, [...checkedSteps], [...checkedIngredients], getToken)
  }

  const sectionNavItems = [
    displayRecipe.ingredients.length > 0 && { id: 'ingredients-heading', label: tx.ingredients, emoji: '🥕' },
    flatSteps.length > 0 && { id: 'steps-heading', label: tx.instructions, emoji: '📋' },
    displayTipsCount > 0 && { id: 'tips-heading', label: tx.tipsTitle, emoji: '💡' },
    { id: 'my-notes-heading', label: tx.myNotes, emoji: '📝' },
    isViewingPublishedContent && { id: 'reviews-heading', label: tx.reviews, emoji: '💬' },
  ].filter((s): s is { id: string; label: string; emoji: string } => !!s)

  return (
    <div className="min-h-dvh bg-bg pt-14" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <RecipeSectionNav sections={sectionNavItems} lang={lang} />
      {/* Hero image */}
      <div className="print:hidden relative h-64 sm:h-96 overflow-hidden">
        {displayRecipe.image?.includes('assets.tugy.dev') ? (
          <SkeletonImage
            src={resizedImage(displayRecipe.image, 1200)}
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
        <div className={`print:hidden absolute top-4 ${lang === 'he' ? 'left-4' : 'right-4'} flex items-center gap-2`}>
          {canEdit && (recipe.currentRevision !== recipe.publishedRevision || recipe.status === 'pending_review') && (
            <button type="button"
              onClick={() => setPublishConfirmOpen(true)}
              disabled={submitting || recipe.status === 'pending_review'}
              title={recipe.status === 'pending_review' ? (tx.pendingAIReview) : undefined}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber text-bg hover:bg-amber/90 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {recipe.status === 'pending_review'
                ? (tx.pendingAIReview2)
                : submitting
                  ? (tx.reviewingWithAI)
                  : (tx.publish)}
            </button>
          )}

          {isViewingPublishedContent && (
            <button type="button"
              onClick={() => toggleFavorite(recipe.id)}
              aria-label={tx.favorite}
              title={tx.favorite}
              className={`flex items-center justify-center h-9 w-9 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 transition-colors ${
                favoriteSlugs.has(recipe.id) ? 'text-amber' : 'text-white/80 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill={favoriteSlugs.has(recipe.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
              </svg>
            </button>
          )}

          <div className="relative" ref={actionsMenuRef}>
            <button type="button"
              onClick={() => setActionsMenuOpen(v => !v)}
              title={tx.moreActions}
              aria-label={tx.moreActions}
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              className="flex items-center justify-center p-2 bg-black/40 backdrop-blur-sm text-white/80 hover:text-white rounded-xl transition-colors border border-white/10"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="12" cy="19" r="1.75" />
              </svg>
            </button>

            <AnimatePresence>
              {actionsMenuOpen && [
                // Mobile: dims the page behind the bottom sheet. Desktop's
                // dropdown closes via the outside-click listener instead, so
                // no backdrop is needed there.
                <motion.div key="backdrop"
                  className="sm:hidden fixed inset-0 z-40 bg-black/50"
                  onClick={closeActionsMenu}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                />,
                <motion.div key="panel"
                  role="menu"
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                  drag={isMobileMenu ? 'y' : false}
                  dragControls={actionsMenuDragControls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_e, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 500) closeActionsMenu()
                  }}
                  initial={isMobileMenu ? { y: '100%' } : { opacity: 0, y: -8 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={isMobileMenu ? { y: '100%' } : { opacity: 0, y: -8 }}
                  transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                  className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-tint/10 sm:rounded-xl sm:border sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:z-30 sm:mt-2 sm:w-72 ${lang === 'he' ? 'sm:left-0' : 'sm:right-0'} bg-bg shadow-2xl p-2 max-h-[75vh] overflow-y-auto`}
                  style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
                >
                  {/* Drag handle - dragging is scoped to this bar (dragListener={false}
                      + imperative start on pointerdown) so it doesn't fight with
                      taps/scrolls on the menu items below it. */}
                  <div
                    className="sm:hidden -mx-2 px-2 pt-1 pb-3 cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={e => actionsMenuDragControls.start(e)}
                  >
                    <div className="w-10 h-1 rounded-full bg-tint/20 mx-auto" />
                  </div>

                  {actionsMenuView === 'collections' ? (
                    <div>
                      <button type="button"
                        onClick={() => setActionsMenuView('root')}
                        className="flex items-center gap-1.5 text-sm font-medium text-cream/50 hover:text-cream/80 transition-colors px-2 py-2 mb-1"
                      >
                        <svg className={`w-4 h-4 ${lang === 'he' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        {tx.saveToCollection}
                      </button>
                      {collections.length === 0 ? (
                        <p className="text-xs text-cream/30 px-2 py-2">
                          {tx.noCollectionsYet}
                        </p>
                      ) : (
                        <ul className="space-y-0.5 max-h-52 overflow-y-auto px-1 mb-1">
                          {collections.map(col => {
                            const inCollection = id ? col.recipeIds.includes(id) : false
                            return (
                              <li key={col._id}>
                                <label className="flex items-center gap-2.5 text-sm text-cream/80 cursor-pointer px-2 py-[13.5px] rounded-lg hover:bg-tint/[0.06] transition-colors">
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
                      <div className="flex gap-1.5 px-2 pb-1">
                        <input
                          value={newCollectionName}
                          onChange={e => setNewCollectionName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') createAndAddCollection() }}
                          placeholder={tx.newCollection}
                          maxLength={60}
                          aria-label={tx.newCollectionName}
                          className="flex-1 bg-tint/[0.03] border border-tint/10 rounded-md px-2 py-1.5 text-xs text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
                        />
                        <button type="button"
                          onClick={createAndAddCollection}
                          disabled={!newCollectionName.trim()}
                          className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {tx.add}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {canEdit && (
                        <div className="pb-1 mb-1 border-b border-tint/10">
                          <button type="button"
                            onClick={() => { closeActionsMenu(); navigate(`/recipes/${id}/edit`) }}
                            disabled={recipe.status === 'pending_review'}
                            title={recipe.status === 'pending_review' ? (tx.lockedWhilePendingAIReview) : undefined}
                            className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-cream/80 hover:bg-tint/[0.06] transition-colors disabled:opacity-40"
                          >
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            {tx.edit2}
                          </button>
                          {/* Never offered for published recipes - deleting
                              those is destructive to something other people
                              rely on/rated. */}
                          {recipe.status !== 'published' && (isAdmin || (isOwner && recipe.publishedRevision == null)) && (
                            <button type="button"
                              onClick={() => { closeActionsMenu(); setDeleteConfirmOpen(true) }}
                              className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              {tx.delete}
                            </button>
                          )}
                        </div>
                      )}

                      <button type="button"
                        onClick={() => setActionsMenuView('collections')}
                        className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-cream/80 hover:bg-tint/[0.06] transition-colors"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        {tx.saveToCollection}
                      </button>

                      {displayRecipe.ingredients.length > 0 && (
                        <button type="button"
                          onClick={() => { closeActionsMenu(); addAllToShoppingList() }}
                          className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-cream/80 hover:bg-tint/[0.06] transition-colors"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m-10 0a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z" />
                          </svg>
                          {tx.addToList}
                        </button>
                      )}

                      <button type="button"
                        onClick={() => void handleDownloadPdf()}
                        disabled={pdfGenerating}
                        className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-cream/80 hover:bg-tint/[0.06] transition-colors disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
                        </svg>
                        {pdfGenerating ? tx.generatingPdf : tx.downloadRecipePdf}
                      </button>

                      {/* Personal recipes (never published) have nothing
                          public to preview or link to, so sharing isn't
                          offered at all. */}
                      {recipe.publishedRevision != null && (
                        <>
                          <button type="button"
                            onClick={() => { closeActionsMenu(); void shareNative() }}
                            className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-cream/80 hover:bg-tint/[0.06] transition-colors"
                          >
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684l-6.44 3.22a3 3 0 100 2.684l6.44-3.22zM8.684 13.342l6.632 3.316m0-11.317l-6.632 3.316" />
                            </svg>
                            {tx.share}
                          </button>
                          <button type="button"
                            onClick={() => { closeActionsMenu(); void copyShareLink() }}
                            className="flex items-center gap-3 w-full text-start px-3 py-[13.5px] rounded-lg text-sm font-medium text-cream/80 hover:bg-tint/[0.06] transition-colors"
                          >
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                            </svg>
                            {tx.copyLink}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </motion.div>,
              ]}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-16 relative pb-24 print:max-w-none print:mx-0 print:mt-0 print:px-0 print:pb-0">
        <div className="flex items-start justify-between gap-2">
          <Breadcrumbs crumbs={[
            { label: tx.home, href: '/' },
            { label: tx.categories[displayRecipe.category] },
            { label: displayTitle },
          ]} />
          {!!recipe.viewCount && (
            <span
              className="print:hidden flex items-center gap-1 text-cream/30 text-xs shrink-0"
              title={tx.uniqueVisitorsCountedOncePerPerson}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {recipe.viewCount}
            </span>
          )}
        </div>
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
                  ? (tx.draft)
                  : recipe.status === 'pending_review'
                    ? (tx.pendingAIReview)
                    : (tx.rejected)}
              </span>
            )}
          </div>

          {canEdit && recipe.status === 'published' && recipe.currentRevision !== recipe.publishedRevision && (
            <p className="text-xs text-amber mb-2">
              {tx.youHaveUnpublishedChanges}
            </p>
          )}

          {submitError && canEdit && (() => {
            const match = submitError.match(/missing\/invalid:\s*(.+)$/i)
            const items = match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : null
            return (
              <div className="card p-3 mb-4 border border-red-400/20">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-red-400 font-medium">
                    {tx.canTSubmitYetNeeds}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitError(null)}
                    aria-label={tx.dismiss}
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

          {canEdit && recipe.status === 'rejected' && recipe.duplicateReview?.isDuplicate && (
            <div className="card p-4 mb-4 border border-red-400/20">
              <p className="text-sm font-semibold text-cream mb-1">{tx.duplicateBlockedTitle}</p>
              <p className="text-xs text-cream/60 mb-3">{tx.duplicateBlockedIntro(recipe.duplicateReview.matchedRecipeTitle)}</p>
              <div className="flex items-center gap-3">
                <Link to={`/recipes/${recipe.duplicateReview.matchedRecipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors">
                  {tx.viewSimilarRecipe}
                </Link>
                {recipe.disputeStatus === 'none' && !disputeFormOpen && (
                  <button type="button" onClick={() => setDisputeFormOpen(true)} disabled={disputing} className="btn-ghost text-xs">
                    {tx.disputeThisDecision}
                  </button>
                )}
                {recipe.disputeStatus === 'pending' && (
                  <span className="text-xs text-cream/40">{tx.disputeUnderReview}</span>
                )}
                {recipe.disputeStatus === 'denied' && (
                  <span className="text-xs text-cream/40">{tx.disputeWasDenied}</span>
                )}
              </div>
              {recipe.disputeStatus === 'none' && disputeFormOpen && (
                <div className="mt-3">
                  <textarea
                    value={disputeMessageInput}
                    onChange={e => setDisputeMessageInput(e.target.value)}
                    placeholder={tx.disputeMessagePlaceholder}
                    rows={2}
                    maxLength={500}
                    className="w-full bg-tint/[0.03] border border-tint/10 rounded-md px-2 py-1.5 text-xs text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <button type="button" onClick={handleDisputeDuplicate} disabled={disputing} className="btn-primary text-xs px-3 py-1.5">
                      {tx.submitDispute}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDisputeFormOpen(false); setDisputeMessageInput('') }}
                      disabled={disputing}
                      className="btn-ghost text-xs"
                    >
                      {tx.cancel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canEdit && recipe.duplicateReview?.isDuplicate && recipe.disputeStatus === 'approved' && (
            <div className="card p-4 mb-4 border border-herb/30">
              <p className="text-sm font-semibold text-herb mb-1">{tx.disputeApprovedTitle}</p>
              <p className="text-xs text-cream/60">{tx.disputeApprovedIntro}</p>
            </div>
          )}

          {/* AI review results - either the outcome of the submission just
              made, or the recipe's last stored review (so a rejected recipe
              still shows its findings on reload, not just right after
              submitting). */}
          {canEdit && review && recipe.status !== 'published' && (
            <div className={`card p-4 mb-4 border ${review.score >= 95 ? 'border-herb/30' : 'border-red-400/20'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-cream">
                  {tx.aIReviewResult}
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
                  {tx.noIssuesFound}
                </p>
              )}
              {recipe.status === 'rejected' && review.suggestedFields && (
                <button
                  type="button"
                  onClick={() => navigate(`/recipes/${id}/edit?applySuggestions=1`)}
                  className="btn-ghost text-xs"
                >
                  {tx.applyChanges}
                </button>
              )}
            </div>
          )}

          {displayRecipe.aiGenerated && (
            <div className="print:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-amber bg-amber/10 border border-amber/20 rounded-full px-3 py-1 mb-3">
              <span>{tx.aICoAuthored}</span>
              <FilterInfoPopover text={tx.thisRecipeWasCoAuthoredWith}
              />
            </div>
          )}

          <h1
            className="font-serif text-3xl sm:text-4xl font-bold text-cream leading-tight mb-1"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            {titleLoading ? <span className="inline-block h-8 w-2/3 bg-tint/10 rounded animate-pulse" /> : displayTitle}
          </h1>
          {recipe.status === 'published' && recipe.ownerName && (
            <p className="text-cream/30 text-xs mb-3">
              {tx.publishedBy}
              <Link to={`/chef/${recipe.ownerId}`} className="text-cream/50 hover:text-amber underline decoration-cream/20 hover:decoration-amber underline-offset-2 transition-colors">
                {recipe.ownerName}
              </Link>
            </p>
          )}
          <p
            className="text-cream/70 text-base leading-relaxed mb-5"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            {descriptionLoading ? <span className="inline-block h-4 w-full bg-tint/10 rounded animate-pulse" /> : displayDescription}
          </p>

          {recipe.source && (
            <p className="text-cream/30 text-xs mb-5">
              {tx.source}
              {recipe.source.startsWith('http') ? (
                <a href={recipe.source} target="_blank" rel="noopener noreferrer" className="underline hover:text-cream/60 transition-colors">
                  {recipe.source.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
                </a>
              ) : (
                recipe.source
              )}
            </p>
          )}

          {/* Actions: view-published-version (owner-only) / cooked / favorite -
              everything else (edit, delete, save to collection, download
              PDF, copy link) lives in the "..." menu on the hero image. */}
          <div className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-3 mb-5">
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
                {tx.viewPublishedVersion}
              </button>
            )}

            {isViewingPublishedContent && (
              <button type="button"
                disabled={cookSessionActive}
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  openWizard()
                }}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">🍳</span>
                {cookSessionActive ? tx.cooking : tx.startCooking}
              </button>
            )}
          </div>

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
                  placeholder={tx.qty}
                  aria-label={tx.customNumberOfServings}
                  className="w-14 bg-transparent text-cream text-sm text-center outline-none placeholder-cream/30"
                  dir="ltr"
                />
              </div>
            </div>
            {multiplier !== 1 && (
              <span className="text-amber text-sm ms-auto">
                {scaledServings} {tx.servings2}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 print:grid-cols-5 gap-6 print:gap-0">
          {/* Ingredients */}
          {displayRecipe.ingredients.length > 0 && <div className="sm:col-span-2 print:col-span-2 card p-5 bg-amber/[0.04] border-amber/10 h-fit print:p-0 print:pe-5 print:border-0 print:border-e print:border-tint/20 print:bg-transparent print:rounded-none">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 id="ingredients-heading" className="font-serif text-xl font-bold text-cream scroll-mt-20">{tx.ingredients}</h2>
              <button type="button"
                onClick={addAllToShoppingList}
                title={tx.addToList}
                className="print:hidden flex items-center gap-1.5 text-xs font-medium text-cream/40 hover:text-cream/70 transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m-10 0a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                {tx.addToList}
              </button>
            </div>
            <div className="space-y-4">
              {displayRecipe.ingredients.map((group, gi) => {
                const hasGroupLabel = !!(group.group || group.groupEn)
                return (
                  <div key={gi}>
                    {hasGroupLabel && (
                      <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-2">
                        <TranslatedText
                          primary={lang === 'he' ? group.group : group.groupEn}
                          secondary={lang === 'he' ? group.groupEn : group.group}
                        />
                      </h3>
                    )}
                    <ul className="space-y-2">
                      {group.items.map((item, ii) => {
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
                                const unitCode = canonicalUnit(item.unit)
                                const unit = lang === 'he' ? heUnit(unitCode, scaled) : unitCode
                                if (!unit) return amt
                                return `${amt} ${unit}`
                              })()}
                            </span>
                            <span className={`transition-colors ${checked ? 'text-cream/30 line-through' : 'text-cream/70'}`}>
                              {item.linkedRecipeId ? (
                                <LinkedIngredientName recipeId={item.linkedRecipeId} lang={lang} />
                              ) : (
                                <TranslatedText
                                  primary={lang === 'he' ? item.name : item.nameEn}
                                  secondary={lang === 'he' ? item.nameEn : item.name}
                                />
                              )}
                              {(item.note || item.noteEn) && (
                                <span className="text-cream/40 italic">
                                  {' ('}
                                  <TranslatedText
                                    primary={lang === 'he' ? item.note : item.noteEn}
                                    secondary={lang === 'he' ? item.noteEn : item.note}
                                  />
                                  {')'}
                                </span>
                              )}
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
            <div className={`flex items-center justify-between ${flatSteps.length > 0 ? 'mb-1' : 'mb-4'}`}>
              <h2 id="steps-heading" className="font-serif text-xl font-bold text-cream scroll-mt-20">{tx.instructions}</h2>
            </div>
            {flatSteps.length > 0 && (
              <p className="print:hidden text-xs text-cream/40 mb-4">{tx.instructionsInteractiveHint}</p>
            )}
            <div className="space-y-6">
              {displayRecipe.steps.map((group, gi) => {
                const hasGroupTitle = !!(group.title || group.titleEn)
                return (
                  <div key={gi}>
                    {hasGroupTitle && (
                      <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-3">
                        <TranslatedText
                          primary={lang === 'he' ? group.title : group.titleEn}
                          secondary={lang === 'he' ? group.titleEn : group.title}
                        />
                      </h3>
                    )}
                    <div className="space-y-3">
                      {group.items.map((step, si) => {
                        const stepKey = `${gi}-${si}`
                        const checked = checkedSteps.has(stepKey)
                        const existingTimer = getTimerForStep(gi, si)
                        const stepNum = stepNums[gi][si]
                        const hasTip = !!(step.tip || step.tipEn)

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
                                  <TranslatedText
                                    primary={lang === 'he' ? step.instruction : step.instructionEn}
                                    secondary={lang === 'he' ? step.instructionEn : step.instruction}
                                  />
                                </p>

                                {step.image && (
                                  <div
                                    className="print:hidden relative mt-2 w-20 h-20 rounded-lg overflow-hidden cursor-zoom-in"
                                    onClick={e => { e.stopPropagation(); setLightboxUrl(step.image!) }}
                                  >
                                    <SkeletonImage
                                      src={resizedImage(step.image, 160)}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}

                                {hasTip && !checked && (
                                  <p className="mt-2 text-xs text-amber/70 flex items-start gap-1.5">
                                    <span className="mt-0.5">💡</span>
                                    <TranslatedText
                                      as="span"
                                      primary={lang === 'he' ? step.tip : step.tipEn}
                                      secondary={lang === 'he' ? step.tipEn : step.tip}
                                    />
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
                                        onClick={() => {
                                          // The timer label is a plain string needed synchronously on click - it
                                          // uses whatever's already available (no live-translate wait) since it's
                                          // a secondary, transient bit of UI, not the main reading content.
                                          const label = lang === 'he' ? step.instruction : (step.instructionEn ?? step.instruction)
                                          startTimer(
                                            `${stepNum}: ${label.length > 40 ? label.slice(0, 40) + '…' : label}`,
                                            step.timerMinutes!,
                                            gi, si
                                          )
                                        }}
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
        {displayTipsCount > 0 && (
          <div className="mt-8 card p-5 print:mt-6 print:p-0 print:border-0 print:border-t print:border-tint/15 print:pt-4 print:rounded-none print:bg-transparent print:break-inside-avoid">
            <h2 id="tips-heading" className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2 scroll-mt-20">
              <span>💡</span> {tx.tipsTitle}
            </h2>
            <ul className="space-y-2">
              {Array.from({ length: displayTipsCount }).map((_, i) => (
                <li key={i} className="flex gap-2 text-sm text-cream/70" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                  <span className="text-amber/60 shrink-0 mt-0.5">-</span>
                  <TranslatedText
                    primary={lang === 'he' ? displayRecipe.tips?.[i] : displayRecipe.tipsEn?.[i]}
                    secondary={lang === 'he' ? displayRecipe.tipsEn?.[i] : displayRecipe.tips?.[i]}
                  />
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
              <span>🔗</span> {tx.sources}
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
              <span>📝</span> {tx.myNotes}
              <span className="font-sans text-[11px] font-normal text-cream/30">
                {tx.privateOnlyVisibleToYou}
              </span>
            </h2>
            {noteStatus !== 'idle' && (
              <span className="text-xs text-cream/30">
                {noteStatus === 'saving' ? (tx.saving) : (tx.saved)}
              </span>
            )}
          </div>
          <textarea
            aria-labelledby="my-notes-heading"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onBlur={() => saveNote(noteInput)}
            placeholder={tx.addAPrivateNoteForThis}
            rows={3}
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-3 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
        </div>

        {/* Reviews */}
        {isViewingPublishedContent && (
        <div className="print:hidden mt-8 card p-5">
          <h2 id="reviews-heading" className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2 scroll-mt-20">
            <span>💬</span> {tx.reviews}
          </h2>
          <div className="flex items-center gap-1.5 mb-4" onMouseLeave={() => setHoverRating(null)}>
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  type="button"
                  key={n}
                  onClick={() => rate(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  aria-label={`${n} ★`}
                  className="text-2xl leading-none p-1"
                >
                  <span className={n <= (hoverRating ?? userRating ?? 0) ? 'text-amber' : 'text-cream/20'}>★</span>
                </button>
              ))}
            </div>
            {!!recipe.averageRating && (
              <span className="text-cream/40 text-xs">
                {recipe.averageRating} ({recipe.ratingCount})
              </span>
            )}
          </div>
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
                  {tx.yourReview}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button"
                    onClick={() => setIsEditingReview(true)}
                    aria-label={tx.editReview}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button type="button"
                    onClick={deleteMyReview}
                    aria-label={tx.deleteReview}
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
                <div className="relative w-24 h-24 rounded-lg overflow-hidden">
                  <SkeletonImage
                    src={resizedImage(reviewPhotoUrl, 160)}
                    alt=""
                    onClick={() => setLightboxUrl(reviewPhotoUrl)}
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                </div>
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
                  ? (tx.shareYourThoughtsOnThisRecipe)
                  : (tx.rateTheRecipeWithStarsAbove)
              }
              rows={2}
              maxLength={500}
              disabled={!userRating}
              className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-3 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none disabled:opacity-50"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            />
            {reviewPhotoUrl && (
              <div className="relative w-24 h-24">
                <SkeletonImage
                  src={resizedImage(reviewPhotoUrl, 160)}
                  alt=""
                  onClick={() => setLightboxUrl(reviewPhotoUrl)}
                  className="w-full h-full object-cover rounded-lg cursor-zoom-in"
                />
                <button type="button"
                  onClick={() => setReviewPhotoUrl(null)}
                  aria-label={tx.removePhoto}
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
                  ? (tx.uploading)
                  : reviewPhotoUrl
                    ? (tx.replacePhoto)
                    : (tx.addPhoto)}
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
                  ? (tx.updateReview)
                  : (tx.postReview)}
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
                  ? (tx.noOtherReviewsYet)
                  : (tx.noReviewsYetBeTheFirst)}
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
                <span>{tx.showRevisionHistory}</span>
                <svg className={`w-3 h-3 transition-transform ${revisionsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {viewingRevision && viewingRevision.revisionNumber !== (canEdit ? recipe.currentRevision : recipe.publishedRevision) && (
                <button type="button"
                  onClick={() => selectRevision(null)}
                  className="text-xs font-semibold text-amber hover:text-amber/80 transition-colors"
                >
                  {tx.backToCurrentVersion}
                </button>
              )}
            </div>
            {revisionsOpen && revisions && (
              revisions.length === 0 ? (
                <p className="mt-3 text-xs text-cream/25">
                  {tx.noRevisionsYet}
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
                                {tx.liveOnSite}
                              </span>
                            )}
                            {isRejectedAttempt && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">
                                {tx.rejected}
                              </span>
                            )}
                            {isLatest && !isLive && !isRejectedAttempt && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber/10 text-amber">
                                {tx.latest}
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
              {tx.youMightAlsoLike}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {relatedRecipes.map(r => {
                const altFallback = lang === 'he' ? (r.titleHe ?? r.title) : r.title
                return (
                  <Link key={r.id} to={`/recipes/${r.id}`} className="group">
                    <div className="relative h-24 rounded-xl overflow-hidden mb-2">
                      {r.image?.includes('assets.tugy.dev') ? (
                        <SkeletonImage
                          src={resizedImage(r.image, 320)}
                          alt={altFallback}
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
                      <TranslatedText
                        primary={lang === 'he' ? r.titleHe : r.title}
                        secondary={lang === 'he' ? r.title : r.titleHe}
                      />
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Reserves layout space for the persistent cook-session dock below,
          so the fixed-position dock doesn't visually hide page content. */}
      {cookSessionActive && flatSteps.length > 0 && (
        <div aria-hidden="true" className="h-[20dvh] sm:h-24" style={{ paddingBottom: timerBarHeight }} />
      )}

      {/* Persistent cook-session dock - collapsed by default, expands to
          90dvh on tap/swipe. Replaces the old fullscreen wizard modal. */}
      {cookSessionActive && flatSteps.length > 0 && (
        <CookDock
          lang={lang}
          ingredients={displayRecipe.ingredients}
          checkedIngredients={checkedIngredients}
          onToggleIngredient={toggleIngredient}
          multiplier={multiplier}
          steps={flatSteps}
          wizardIndex={wizardIndex}
          onPrev={() => setWizardIndex(i => Math.max(i - 1, 0))}
          onAdvance={key => { markStepChecked(key); advanceWizardOrFinish() }}
          onMarkDone={handleWizardMarkDone}
          onStop={stopCooking}
          onStepEntered={handleStepEntered}
          onExpand={() => backgroundCookStatusRef.current?.exitFloatingView()}
          checkedSteps={checkedSteps}
          nearestTimer={nearestTimer}
          onToggleNearestTimer={pipToggleNearestTimer}
          getTimerForStep={getTimerForStep}
          onStartTimer={startTimer}
          onOpenLightbox={setLightboxUrl}
          timerBarHeight={timerBarHeight}
          lightboxOpen={!!lightboxUrl}
          elapsedBaselineMs={cookSessionStartedAt ? new Date(cookSessionStartedAt).getTime() : undefined}
          startExpanded={startDockExpanded}
          onExpandConsumed={() => setStartDockExpanded(false)}
        />
      )}

      {/* Ongoing-cook status: mirrors the current guided step + nearest timer into an OS
          notification and a floating Picture-in-Picture widget while the app is minimized. */}
      <BackgroundCookStatus
        ref={backgroundCookStatusRef}
        active={cookSessionActive && !!currentWizardStep}
        recipeTitle={displayTitle ?? ''}
        stepLabel={wizardStepLabel}
        stepText={currentWizardStep?.instruction ?? ''}
        nearestTimer={nearestTimer}
        lang={lang}
        canGoPrev={wizardIndex > 0}
        canGoNext={wizardIndex < flatSteps.length - 1}
        onToggleNearestTimer={pipToggleNearestTimer}
        onPrevStep={pipPreviousStep}
        onNextStep={pipNextStep}
      />

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
            aria-label={tx.close}
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
        title={tx.deleteRecipe}
        message={tx.permanentlyDeleteThisRecipeThisCannot}
        confirmLabel={deleting ? (tx.deleting) : (tx.delete)}
        cancelLabel={tx.cancel}
        danger
        busy={deleting}
        onConfirm={handleDeleteRecipe}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmDialog
        open={publishConfirmOpen}
        title={tx.publishRecipe}
        message={tx.publishThisRecipeForAIReview}
        confirmLabel={tx.publish}
        cancelLabel={tx.cancel}
        busy={submitting}
        onConfirm={() => { setPublishConfirmOpen(false); handleSubmitForReview() }}
        onCancel={() => setPublishConfirmOpen(false)}
      />

      <ConfirmDialog
        open={!!cookConflict}
        title={tx.alreadyCookingElsewhere}
        message={cookConflict ? tx.cookingElsewhereWarning(cookConflict.recipeTitle) : ''}
        confirmLabel={tx.startNewCook}
        cancelLabel={tx.cancel}
        busy={resolvingCookConflict}
        onConfirm={confirmStartNewCook}
        onCancel={() => setCookConflict(null)}
      />
    </div>
  )
}
