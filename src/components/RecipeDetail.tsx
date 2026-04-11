import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getRecipe } from '../data/recipes'
import { formatTime, scaleAmount } from '../utils/format'
import { t, categoryEmoji, heUnits } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import type { TimerState } from '../types'

interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  timers: TimerState[]
}

const presetMultipliers = [0.5, 1, 1.5, 2, 3, 4]
const presetLabels: Record<number, string> = { 0.5: '½x', 1: '1x', 1.5: '1.5x', 2: '2x', 3: '3x', 4: '4x' }

export default function RecipeDetail({ onAddTimer, timers }: RecipeDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const tx = t[lang]
  const recipe = id ? getRecipe(id) : undefined

  const [multiplier, setMultiplier] = useState(1)
  const [customInput, setCustomInput] = useState('')
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())

  if (!recipe) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center pt-14">
        <div className="text-center">
          <p className="text-6xl mb-4">🍳</p>
          <p className="text-cream/60 text-lg">{tx.notFound}</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-6">
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

  function toggleStep(key: string) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function getTimerForStep(groupIdx: number, stepIdx: number) {
    return timers.find(t => t.recipeId === recipe!.id && t.stepIndex === groupIdx * 1000 + stepIdx)
  }

  function startTimer(label: string, minutes: number, groupIdx: number, stepIdx: number) {
    onAddTimer(label, minutes, recipe!.id, groupIdx * 1000 + stepIdx)
  }

  function handleCustomInput(val: string) {
    setCustomInput(val)
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0 && n <= 100) {
      setMultiplier(n / recipe!.servings)
    }
  }

  function handlePresetClick(m: number) {
    setMultiplier(m)
    setCustomInput('')
  }

  let globalStepNum = 0

  return (
    <div className="min-h-screen bg-bg pt-14" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {/* Hero image */}
      <div className="relative h-64 sm:h-96 overflow-hidden">
        <img
          src={recipe.image}
          alt={displayTitle}
          className="w-full h-full object-cover"
          onError={e => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=900&q=80'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <button
          onClick={() => navigate('/')}
          className={`absolute top-4 ${lang === 'he' ? 'right-4' : 'left-4'} flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-sm text-cream/80 hover:text-cream rounded-xl text-sm transition-colors border border-tint/10`}
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

      <div className="max-w-3xl mx-auto px-4 -mt-16 relative pb-32">
        {/* Header card */}
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="tag">{categoryEmoji[recipe.category]} {tx.categories[recipe.category]}</span>
            {recipe.cuisine && <span className="tag">{recipe.cuisine}</span>}
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
        </div>

        {/* Portion control */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-cream/60 text-sm font-medium">{tx.portions}</span>
            <div className="flex gap-1.5 flex-wrap">
              {presetMultipliers.map(m => (
                <button
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
                  className="w-14 bg-transparent text-cream text-sm text-center outline-none placeholder-cream/30"
                  dir="ltr"
                />
                <span className="text-cream/30 text-xs">{lang === 'he' ? 'מנות' : 'srv'}</span>
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
          <div className="sm:col-span-2">
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
                        return (
                          <li key={ii} className="flex gap-2 text-sm">
                            <span className="font-semibold text-cream/90 shrink-0 w-14 text-right" dir="ltr">
                              {scaleAmount(item.amount, multiplier)} {lang === 'he' ? (heUnits[item.unit] ?? item.unit) : item.unit}
                            </span>
                            <span className="text-cream/70" dir={lang === 'he' ? 'rtl' : 'ltr'}>
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
          </div>

          {/* Steps */}
          <div className="sm:col-span-3">
            <h2 className="font-serif text-xl font-bold text-cream mb-4">{tx.instructions}</h2>
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
                        globalStepNum++
                        const stepNum = globalStepNum
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
                          >
                            <div className="flex gap-3">
                              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                                checked ? 'bg-herb text-white' : 'bg-tint/10 text-cream/50'
                              }`}>
                                {checked ? '✓' : stepNum}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm leading-relaxed transition-colors ${
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
                                      <div className="flex items-center gap-2 text-xs text-amber/70">
                                        <span>⏱</span>
                                        <span>{tx.timerRunning}</span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => startTimer(
                                          `${stepNum}: ${instruction.slice(0, 40)}...`,
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
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
