import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getRecipe, categoryEmoji, categoryLabels } from '../data/recipes'
import { formatTime, scaleAmount } from '../utils/format'
import type { TimerState } from '../types'

interface RecipeDetailProps {
  onAddTimer: (label: string, minutes: number, recipeId: string, stepIndex: number) => void
  timers: TimerState[]
}

const multipliers = [0.5, 1, 1.5, 2, 3, 4]
const multiplierLabels: Record<number, string> = {
  0.5: '½x',
  1: '1x',
  1.5: '1.5x',
  2: '2x',
  3: '3x',
  4: '4x',
}

export default function RecipeDetail({ onAddTimer, timers }: RecipeDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const recipe = id ? getRecipe(id) : undefined
  const [multiplier, setMultiplier] = useState(1)
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())

  if (!recipe) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center pt-14">
        <div className="text-center">
          <p className="text-6xl mb-4">🍳</p>
          <p className="text-cream/60 text-lg">Recipe not found</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-6">
            Back to recipes
          </button>
        </div>
      </div>
    )
  }

  const totalTime = recipe.prepTime + recipe.cookTime
  const scaledServings = Math.round(recipe.servings * multiplier)

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

  let globalStepNum = 0

  return (
    <div className="min-h-screen bg-bg pt-14">
      {/* Hero image */}
      <div className="relative h-64 sm:h-96 overflow-hidden">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <button
          onClick={() => navigate('/')}
          className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-sm text-cream/80 hover:text-cream rounded-xl text-sm transition-colors border border-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-16 relative pb-32">
        {/* Header card */}
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="tag">{categoryEmoji[recipe.category]} {categoryLabels[recipe.category]}</span>
            {recipe.cuisine && <span className="tag">{recipe.cuisine}</span>}
            {recipe.featured && <span className="tag-terra text-xs font-semibold">Featured</span>}
          </div>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-cream leading-tight mb-1">
            {recipe.title}
          </h1>
          {recipe.titleHe && (
            <p className="text-cream/40 text-lg mb-3" dir="rtl">{recipe.titleHe}</p>
          )}
          <p className="text-cream/70 text-base leading-relaxed mb-5">{recipe.description}</p>

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Prep', value: formatTime(recipe.prepTime), icon: '🔪' },
              { label: 'Cook', value: formatTime(recipe.cookTime), icon: '🔥' },
              { label: 'Total', value: formatTime(totalTime), icon: '⏱' },
              { label: 'Servings', value: scaledServings.toString(), icon: '🍽' },
            ].map(item => (
              <div key={item.label} className="bg-white/[0.03] rounded-xl p-3 text-center border border-white/5">
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
            <span className="text-cream/60 text-sm font-medium">Portions:</span>
            <div className="flex gap-1.5">
              {multipliers.map(m => (
                <button
                  key={m}
                  onClick={() => setMultiplier(m)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    multiplier === m
                      ? 'bg-amber text-bg scale-105'
                      : 'bg-white/[0.04] text-cream/60 hover:text-cream hover:bg-white/[0.08] border border-white/10'
                  }`}
                >
                  {multiplierLabels[m]}
                </button>
              ))}
            </div>
            {multiplier !== 1 && (
              <span className="text-amber text-sm ml-auto">
                {scaledServings} servings
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
          {/* Ingredients */}
          <div className="sm:col-span-2">
            <h2 className="font-serif text-xl font-bold text-cream mb-4">Ingredients</h2>
            <div className="space-y-4">
              {recipe.ingredients.map((group, gi) => (
                <div key={gi}>
                  {group.group && (
                    <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-2">
                      {group.group}
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {group.items.map((item, ii) => (
                      <li key={ii} className="flex gap-2 text-sm">
                        <span className="font-semibold text-cream/90 shrink-0 w-14 text-right">
                          {scaleAmount(item.amount, multiplier)} {item.unit}
                        </span>
                        <span className="text-cream/70">
                          {item.name}
                          {item.note && <span className="text-cream/40 italic"> ({item.note})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="sm:col-span-3">
            <h2 className="font-serif text-xl font-bold text-cream mb-4">Instructions</h2>
            <div className="space-y-6">
              {recipe.steps.map((group, gi) => (
                <div key={gi}>
                  {group.title && (
                    <h3 className="text-amber text-xs font-semibold uppercase tracking-wider mb-3">
                      {group.title}
                    </h3>
                  )}
                  <div className="space-y-3">
                    {group.items.map((step, si) => {
                      const stepKey = `${gi}-${si}`
                      const checked = checkedSteps.has(stepKey)
                      const existingTimer = getTimerForStep(gi, si)
                      globalStepNum++
                      const stepNum = globalStepNum

                      return (
                        <motion.div
                          key={si}
                          layout
                          className={`relative rounded-xl border p-4 transition-colors cursor-pointer ${
                            checked
                              ? 'border-herb/30 bg-herb/5'
                              : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                          }`}
                          onClick={() => toggleStep(stepKey)}
                        >
                          <div className="flex gap-3">
                            {/* Step number / check */}
                            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                              checked ? 'bg-herb text-white' : 'bg-white/10 text-cream/50'
                            }`}>
                              {checked ? '✓' : stepNum}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-relaxed transition-colors ${
                                checked ? 'text-cream/40 line-through' : 'text-cream/80'
                              }`}>
                                {step.instruction}
                              </p>

                              {step.tip && !checked && (
                                <p className="mt-2 text-xs text-amber/70 flex items-start gap-1.5">
                                  <span className="mt-0.5">💡</span>
                                  <span>{step.tip}</span>
                                </p>
                              )}

                              {/* Timer button */}
                              {step.timerMinutes && !checked && (
                                <div className="mt-3" onClick={e => e.stopPropagation()}>
                                  {existingTimer ? (
                                    <div className="flex items-center gap-2 text-xs text-amber/70">
                                      <span>⏱</span>
                                      <span>Timer running — see panel below</span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => startTimer(
                                        `Step ${stepNum}: ${step.instruction.slice(0, 40)}...`,
                                        step.timerMinutes!,
                                        gi, si
                                      )}
                                      className="btn-ghost text-xs flex items-center gap-1.5"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      Start {step.timerMinutes}m timer
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
              ))}
            </div>
          </div>
        </div>

        {/* Tips */}
        {recipe.tips && recipe.tips.length > 0 && (
          <div className="mt-8 card p-5">
            <h2 className="font-serif text-lg font-bold text-cream mb-3 flex items-center gap-2">
              <span>💡</span> Tips & Notes
            </h2>
            <ul className="space-y-2">
              {recipe.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-cream/70">
                  <span className="text-amber/60 shrink-0 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {recipe.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}


      </div>
    </div>
  )
}
