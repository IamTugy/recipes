import { useEffect, useState } from 'react'
import RecipePlaceholder from './RecipePlaceholder'
import RecipeDetailSkeleton from './RecipeDetailSkeleton'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useRecipe, useRecipes } from '../hooks/useRecipes'
import { useWakeLock } from '../hooks/useWakeLock'
import { useFavorites } from '../hooks/useFavorites'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { useNote } from '../hooks/useNote'
import { useAuth } from '@clerk/react'
import { formatTime, formatSeconds, scaleAmount } from '../utils/format'
import { t, categoryEmoji, heUnit, difficultyColor } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import type { TimerState } from '../types'

interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  timers: TimerState[]
  onAddToShoppingList: (items: { name: string; amount: string }[], recipeTitle: string) => void
}

const presetMultipliers = [0.5, 1, 1.5, 2, 3, 4]
const presetLabels: Record<number, string> = { 0.5: '½x', 1: '1x', 1.5: '1.5x', 2: '2x', 3: '3x', 4: '4x' }

export default function RecipeDetail({ onAddTimer, timers, onAddToShoppingList }: RecipeDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const tx = t[lang]
  const { recipe, loading: recipeLoading } = useRecipe(id)
  const { recipes: allRecipes } = useRecipes()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { addRecent } = useRecentlyViewed()
  const { text: savedNote, save: saveNote, status: noteStatus } = useNote(id)
  const { getToken } = useAuth()

  const [multiplier, setMultiplier] = useState(1)
  const [customInput, setCustomInput] = useState('')
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const [userRating, setUserRating] = useState<number | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const [noteInput, setNoteInput] = useState('')
  const [reviews, setReviews] = useState<{ score: number; comment: string; createdAt: string }[]>([])
  const [reviewComment, setReviewComment] = useState('')
  const cookMode = useWakeLock()

  // Sync the textarea once the saved note has loaded for this recipe
  useEffect(() => {
    setNoteInput(savedNote)
  }, [savedNote])

  async function loadReviews() {
    const token = await getToken()
    const res = await fetch(`/api/ratings/${id}/reviews`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.ok) setReviews(await res.json())
  }

  useEffect(() => {
    if (id) loadReviews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function submitRating(score: number, comment?: string) {
    setUserRating(score)
    const token = await getToken()
    await fetch(`/api/ratings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ score, comment }),
    })
    loadReviews()
  }

  function rate(score: number) {
    submitRating(score)
  }

  function postReview() {
    if (!userRating) return
    submitRating(userRating, reviewComment.trim() || undefined)
    setReviewComment('')
  }

  async function share() {
    const shareData = { title: recipe?.title, url: window.location.href }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch { /* user cancelled */ }
      return
    }
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    } catch { /* clipboard unavailable */ }
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
  }, [id])

  // Track this recipe as recently viewed once it has loaded
  useEffect(() => {
    if (recipe) addRecent(recipe.id)
  }, [recipe, addRecent])

  if (recipeLoading) {
    return <RecipeDetailSkeleton />
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

  const totalTime = recipe.prepTime + recipe.cookTime
  const scaledServings = Math.round(recipe.servings * multiplier)

  const displayTitle = lang === 'he' ? (recipe.titleHe ?? recipe.title) : recipe.title
  const displaySubtitle = lang === 'he' ? recipe.title : recipe.titleHe
  const displayDescription = lang === 'he'
    ? recipe.description
    : (recipe.descriptionEn ?? recipe.description)
  const displayTips = lang === 'he'
    ? (recipe.tips ?? [])
    : (recipe.tipsEn ?? recipe.tips ?? [])

  const relatedRecipes = allRecipes
    .filter(r => r.id !== recipe.id && r.category === recipe.category && !r.hidden)
    .slice(0, 4)

  function addAllToShoppingList() {
    const items = recipe!.ingredients.flatMap(group =>
      group.items.map(item => {
        const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
        if (item.amount == null) return { name: itemName, amount: '' }
        const scaled = item.amount * multiplier
        const amt = scaleAmount(item.amount, multiplier)
        const unit = lang === 'he' ? heUnit(item.unit, scaled) : item.unit
        return { name: itemName, amount: unit ? `${amt} ${unit}` : amt }
      })
    )
    onAddToShoppingList(items, displayTitle)
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
  const stepNums = recipe.steps.map(g => g.items.map(() => ++_n))

  return (
    <div className="min-h-dvh bg-bg pt-14" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {/* Hero image */}
      <div className="relative h-64 sm:h-96 overflow-hidden">
        {recipe.image.includes('assets.tugy.dev') ? (
          <img
            src={recipe.image}
            alt={displayTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <RecipePlaceholder recipe={recipe} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <button type="button"
          onClick={() => navigate('/')}
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
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-16 relative pb-24">
        {/* Header card */}
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="tag">{categoryEmoji[recipe.category]} {tx.categories[recipe.category]}</span>
            {recipe.cuisine && <span className="tag">{recipe.cuisine}</span>}
            <span className={`tag font-semibold ${difficultyColor[recipe.difficulty]}`}>
              {tx.difficulty[recipe.difficulty]}
            </span>
            {recipe.featured && <span className="tag-terra text-xs font-semibold">{tx.featured}</span>}
          </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: tx.prep, value: formatTime(recipe.prepTime), icon: '🔪' },
              { label: tx.cook, value: formatTime(recipe.cookTime), icon: '🔥' },
              { label: tx.total, value: formatTime(totalTime), icon: '⏱' },
              { label: tx.servings, value: scaledServings.toString(), icon: '🍽' },
            ].map(item => (
              <div key={item.label} className="bg-tint/[0.03] rounded-xl p-3 text-center border border-tint/5">
                <p className="text-xl mb-1">{item.icon}</p>
                <p className="font-bold text-cream text-lg">{item.value}</p>
                <p className="text-cream/40 text-xs">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Favorite / rating / share / print */}
          <div className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-3 mt-5 pt-5 border-t border-tint/[0.06]">
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

            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map(n => (
                <button type="button" key={n} onClick={() => rate(n)} className="text-lg leading-none p-1.5">
                  <span className={n <= (userRating ?? 0) ? 'text-amber' : 'text-cream/20'}>★</span>
                </button>
              ))}
              {!!recipe.averageRating && (
                <span className="text-cream/40 text-xs ms-1">
                  {recipe.averageRating} ({recipe.ratingCount})
                </span>
              )}
            </div>

            {!!recipe.viewCount && (
              <span className="flex items-center gap-1 text-cream/30 text-xs">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {recipe.viewCount}
              </span>
            )}

            {recipe.ingredients.length > 0 && (
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

            <button type="button"
              onClick={share}
              className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684l-6.44 3.22a3 3 0 100 2.684l6.44-3.22zM8.684 13.342l6.632 3.316m0-11.317l-6.632 3.316" />
              </svg>
              {shareState === 'copied' ? (lang === 'he' ? 'הועתק!' : 'Copied!') : (lang === 'he' ? 'שתף' : 'Share')}
            </button>

            <button type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              {lang === 'he' ? 'הדפס' : 'Print'}
            </button>
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

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
          {/* Ingredients */}
          {recipe.ingredients.length > 0 && <div className="sm:col-span-2">
            <h2 className="font-serif text-xl font-bold text-cream mb-4">{tx.ingredients}</h2>
            <div className="space-y-4">
              {recipe.ingredients.map((group, gi) => {
                const groupLabel = lang === 'he' ? group.group : (group.groupEn ?? group.group)
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
                              className={`shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors ${
                                checked ? 'bg-herb border-herb text-white' : 'border-tint/20 text-transparent'
                              }`}
                            >
                              {checked && '✓'}
                            </span>
                            <span className={`font-semibold shrink-0 w-14 text-right transition-colors ${checked ? 'text-cream/30 line-through' : 'text-cream/90'}`} dir={lang === 'he' ? 'rtl' : 'ltr'}>
                              {(() => {
                                if (item.amount == null) return null
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
          <div className="sm:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-bold text-cream">{tx.instructions}</h2>
              {cookMode.supported && (
                <button type="button"
                  onClick={cookMode.toggle}
                  className={`print:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    cookMode.active
                      ? 'bg-amber/10 border-amber/30 text-amber'
                      : 'border-tint/10 text-cream/40 hover:text-cream/70'
                  }`}
                  title={lang === 'he' ? 'שמור על המסך דלוק בזמן בישול' : 'Keeps your screen awake while cooking'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {lang === 'he' ? 'מצב בישול' : 'Cook Mode'}
                </button>
              )}
            </div>
            <div className="space-y-6">
              {recipe.steps.map((group, gi) => {
                const groupTitle = lang === 'he' ? group.title : (group.titleEn ?? group.title)
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
                            className={`relative rounded-xl border p-4 transition-colors cursor-pointer ${
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
                              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                                checked ? 'bg-herb text-white' : 'bg-tint/10 text-cream/50'
                              }`}>
                                {checked ? '✓' : stepNum}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`leading-relaxed transition-colors ${cookMode.active ? 'text-base' : 'text-sm'} ${
                                    checked ? 'text-cream/40 line-through' : 'text-cream/80'
                                  }`}
                                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                                >
                                  {instruction}
                                </p>

                                {tip && !checked && (
                                  <p className="mt-2 text-xs text-amber/70 flex items-start gap-1.5">
                                    <span className="mt-0.5">💡</span>
                                    <span dir={lang === 'he' ? 'rtl' : 'ltr'}>{tip}</span>
                                  </p>
                                )}

                                {step.timerMinutes && !checked && (
                                  <div className="mt-3" onClick={e => e.stopPropagation()}>
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
          <div className="mt-8 card p-5">
            <h2 className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2">
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
        {recipe.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(lang === 'he' ? recipe.tags : (recipe.tagsEn ?? recipe.tags)).map(tag => (
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

        {/* Personal notes */}
        <div className="print:hidden mt-8 card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 id="my-notes-heading" className="font-serif text-lg font-bold text-cream flex items-center gap-2">
              <span>📝</span> {lang === 'he' ? 'ההערות שלי' : 'My Notes'}
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
        <div className="print:hidden mt-8 card p-5">
          <h2 id="reviews-heading" className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2">
            <span>💬</span> {lang === 'he' ? 'ביקורות' : 'Reviews'}
          </h2>
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
            <button type="button"
              onClick={postReview}
              disabled={!userRating || !reviewComment.trim()}
              className="self-start px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {lang === 'he' ? 'פרסם ביקורת' : 'Post review'}
            </button>
          </div>
          {reviews.length > 0 ? (
            <ul className="space-y-4">
              {reviews.map((r, i) => (
                <li key={i} className="border-t border-tint/[0.06] pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-amber text-sm leading-none">
                      {'★'.repeat(r.score)}
                      <span className="text-cream/15">{'★'.repeat(5 - r.score)}</span>
                    </span>
                    <span className="text-cream/25 text-[11px]">
                      {new Date(r.createdAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                    </span>
                  </div>
                  <p className="text-sm text-cream/70 leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                    {r.comment}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-cream/25">
              {lang === 'he' ? 'אין עדיין ביקורות. היו הראשונים!' : 'No reviews yet. Be the first!'}
            </p>
          )}
        </div>

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
                  <Link key={r.id} to={`/recipe/${r.id}`} className="group">
                    <div className="relative h-24 rounded-xl overflow-hidden mb-2">
                      {r.image.includes('assets.tugy.dev') ? (
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
    </div>
  )
}
