import { useEffect, useState } from 'react'
import CategoryIllustration from './placeholders/CategoryIllustration'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getRecipe } from '../data/recipes'
import { formatTime, formatSeconds, scaleAmount } from '../utils/format'
import { t, categoryEmoji, heUnit } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import type { TimerState } from '../types'
import { SteamSwirl, Sparkle, LeafSprig } from './motifs'

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

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`checked-${id}`)
      setCheckedSteps(saved ? new Set(JSON.parse(saved)) : new Set())
    } catch { setCheckedSteps(new Set()) }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [id])

  if (!recipe) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center pt-16">
        <div className="text-center">
          <p className="text-6xl mb-4">🍳</p>
          <p className="text-ink/60 text-lg">{tx.notFound}</p>
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

  const hasImage = recipe.image && recipe.image.includes('assets.tugy.dev')

  function toggleStep(key: string) {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      try { sessionStorage.setItem(`checked-${id}`, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function getTimerForStep(groupIdx: number, stepIdx: number) {
    const key = groupIdx * 10000 + stepIdx
    return timers.find(timer => timer.recipeId === recipe!.id && timer.stepIndex === key)
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

  let _n = 0
  const stepNums = recipe.steps.map(g => g.items.map(() => ++_n))

  return (
    <div className="min-h-screen bg-bg pt-16" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {/* Hero */}
      <div className="relative h-72 sm:h-[420px] overflow-hidden">
        {hasImage ? (
          <img src={recipe.image} alt={displayTitle} className="w-full h-full object-cover" />
        ) : (
          <CategoryIllustration category={recipe.category} title={recipe.id} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />

        {/* Steam overlay */}
        <div className="absolute top-6 right-10 text-accent/50 animate-steam pointer-events-none hidden sm:block">
          <SteamSwirl width="60" height="80" />
        </div>

        <button
          onClick={() => navigate('/')}
          className={`absolute top-4 ${lang === 'he' ? 'right-4' : 'left-4'} flex items-center gap-2 px-4 py-2 bg-card/80 backdrop-blur-md text-ink/75 hover:text-accent rounded-full text-sm transition-colors border border-tint/10 shadow-lg`}
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

      <div className="max-w-4xl mx-auto px-4 -mt-20 relative pb-24">
        {/* Header card */}
        <div className="card card-paper p-8 mb-6 relative overflow-hidden">
          <div className="absolute top-4 right-4 text-accent/25 pointer-events-none">
            <LeafSprig width="40" height="60" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="tag">{categoryEmoji[recipe.category]} {tx.categories[recipe.category]}</span>
            {recipe.cuisine && <span className="tag-herb">{recipe.cuisine}</span>}
            {recipe.featured && (
              <span className="tag-terra">
                <Sparkle width="10" height="10" /> {tx.featured}
              </span>
            )}
          </div>

          <h1
            className="font-serif text-4xl sm:text-5xl font-medium text-ink leading-[1.05] mb-2"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            {displayTitle}
          </h1>
          {displaySubtitle && (
            <p
              className="text-ink/40 text-xl font-serif italic mb-4"
              dir={lang === 'he' ? 'ltr' : 'rtl'}
            >
              {displaySubtitle}
            </p>
          )}
          <p
            className="text-ink/70 text-base leading-relaxed mb-6 max-w-2xl"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            {displayDescription}
          </p>

          {recipe.source && (
            <p className="text-ink/35 text-xs mb-6 smallcaps">
              {lang === 'he' ? 'מקור · ' : 'Source · '}
              {recipe.source.startsWith('http') ? (
                <a href={recipe.source} target="_blank" rel="noopener noreferrer" className="underline hover:text-accent transition-colors">
                  {recipe.source.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
                </a>
              ) : (
                recipe.source
              )}
            </p>
          )}

          {/* Meta row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: tx.prep, value: formatTime(recipe.prepTime), icon: '🔪' },
              { label: tx.cook, value: formatTime(recipe.cookTime), icon: '🔥' },
              { label: tx.total, value: formatTime(totalTime), icon: '⏱' },
              { label: tx.servings, value: scaledServings.toString(), icon: '🍽' },
            ].map(item => (
              <div key={item.label} className="bg-surface/60 rounded-2xl p-4 text-center border border-tint/5">
                <p className="text-2xl mb-1">{item.icon}</p>
                <p className="font-serif text-2xl text-ink">{item.value}</p>
                <p className="text-ink/45 text-[11px] smallcaps mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Portion control */}
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-ink/70 text-sm font-medium smallcaps">{tx.portions}</span>
            <div className="flex gap-1.5 flex-wrap">
              {presetMultipliers.map(m => (
                <button
                  key={m}
                  onClick={() => handlePresetClick(m)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    multiplier === m && !customInput
                      ? 'bg-accent text-card scale-105 shadow-md shadow-accent/30'
                      : 'bg-surface text-ink/65 hover:text-accent hover:bg-surface/80 border border-tint/10'
                  }`}
                >
                  {presetLabels[m]}
                </button>
              ))}
              <div className="flex items-center gap-1.5 bg-surface border border-tint/10 rounded-full px-3 py-1">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={customInput}
                  onChange={e => handleCustomInput(e.target.value)}
                  placeholder={lang === 'he' ? 'מנות' : 'qty'}
                  className="w-14 bg-transparent text-ink text-sm text-center outline-none placeholder-ink/30"
                  dir="ltr"
                />
              </div>
            </div>
            {multiplier !== 1 && (
              <span className="text-accent text-sm ms-auto font-serif italic">
                → {scaledServings} {lang === 'he' ? 'מנות' : 'servings'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
          {/* Ingredients */}
          {recipe.ingredients.length > 0 && (
            <div className="sm:col-span-2">
              <div className="sticky top-20">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-accent"><LeafSprig width="14" height="22" /></span>
                  <h2 className="font-serif text-2xl text-ink">{tx.ingredients}</h2>
                </div>
                <div className="card card-paper p-5 space-y-5">
                  {recipe.ingredients.map((group, gi) => {
                    const groupLabel = lang === 'he' ? group.group : (group.groupEn ?? group.group)
                    return (
                      <div key={gi}>
                        {groupLabel && (
                          <h3 className="text-accent smallcaps mb-3">
                            {groupLabel}
                          </h3>
                        )}
                        <ul className="space-y-2.5">
                          {group.items.map((item, ii) => {
                            const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
                            const itemNote = lang === 'he' ? item.note : (item.noteEn ?? item.note)
                            return (
                              <li key={ii} className="flex gap-2 text-sm items-baseline border-b border-tint/5 pb-2 last:border-0 last:pb-0" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                                <span className="font-semibold text-accent shrink-0 min-w-[3.5rem] font-mono text-[13px]" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                                  {(() => {
                                    if (item.amount == null) return '·'
                                    const scaled = item.amount * multiplier
                                    const amt = scaleAmount(item.amount, multiplier)
                                    const unit = lang === 'he' ? heUnit(item.unit, scaled) : item.unit
                                    if (!unit) return amt
                                    return `${amt} ${unit}`
                                  })()}
                                </span>
                                <span className="text-ink/80 flex-1">
                                  {itemName}
                                  {itemNote && <span className="text-ink/40 italic"> ({itemNote})</span>}
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
            </div>
          )}

          {/* Steps */}
          <div className="sm:col-span-3">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-highlight"><Sparkle width="16" height="16" /></span>
              <h2 className="font-serif text-2xl text-ink">{tx.instructions}</h2>
            </div>

            <div className="space-y-7">
              {recipe.steps.map((group, gi) => {
                const groupTitle = lang === 'he' ? group.title : (group.titleEn ?? group.title)
                return (
                  <div key={gi}>
                    {groupTitle && (
                      <h3 className="text-accent smallcaps mb-3 flex items-center gap-2">
                        <span className="inline-block w-6 h-px bg-accent/40" />
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
                            className={`relative rounded-2xl border p-5 transition-colors cursor-pointer ${
                              checked
                                ? 'border-accent-soft/40 bg-accent-soft/15'
                                : 'border-tint/8 bg-card hover:border-accent/30 hover:bg-card/70'
                            }`}
                            onClick={() => toggleStep(stepKey)}
                          >
                            <div className="flex gap-4">
                              <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-serif text-lg transition-all ${
                                checked
                                  ? 'bg-accent-soft text-card'
                                  : 'bg-accent/10 text-accent border-2 border-accent/30'
                              }`}>
                                {checked ? '✓' : stepNum}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-[15px] leading-relaxed transition-colors ${
                                    checked ? 'text-ink/40 line-through' : 'text-ink/85'
                                  }`}
                                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                                >
                                  {instruction}
                                </p>

                                {tip && !checked && (
                                  <p className="mt-3 text-xs text-highlight/85 flex items-start gap-1.5 italic">
                                    <span className="mt-0.5">💡</span>
                                    <span dir={lang === 'he' ? 'rtl' : 'ltr'}>{tip}</span>
                                  </p>
                                )}

                                {step.timerMinutes && !checked && (
                                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                                    {existingTimer ? (
                                      <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-mono font-semibold border ${
                                        existingTimer.done
                                          ? 'text-accent-soft border-accent-soft/40 bg-accent-soft/15'
                                          : existingTimer.running
                                            ? 'text-accent border-accent/40 bg-accent/10 animate-pulse'
                                            : 'text-ink/55 border-tint/20 bg-surface'
                                      }`}>
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {existingTimer.done ? tx.timerDone : formatSeconds(existingTimer.remainingSeconds)}
                                      </div>
                                    ) : (
                                      <button
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
          <div className="mt-10 card card-paper p-6 relative overflow-hidden">
            <div className="absolute -top-4 -right-4 text-highlight/20 rotate-12 pointer-events-none">
              <SteamSwirl width="80" height="100" />
            </div>
            <h2 className="font-serif text-2xl text-ink mb-4 flex items-center gap-2">
              <span className="text-highlight">💡</span> {tx.tipsTitle}
            </h2>
            <ul className="space-y-3">
              {displayTips.map((tip, i) => (
                <li key={i} className="flex gap-3 text-[15px] text-ink/75 leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                  <span className="text-highlight shrink-0 mt-0.5 font-serif text-xl leading-none">※</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {recipe.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {(lang === 'he' ? recipe.tags : (recipe.tagsEn ?? recipe.tags)).map(tag => (
              <span key={tag} className="tag-herb">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
