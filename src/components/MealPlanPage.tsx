import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMealPlan, type MealType } from '../hooks/useMealPlan'
import { useRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import AppSelect from './ui/AppSelect'
import { t } from "../i18n";

interface MealPlanPageProps {
  onAddToShoppingList: (items: { name: string; amount: number | null; unit: string }[]) => void
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfWeek(offsetWeeks: number): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  now.setDate(now.getDate() + offsetWeeks * 7)
  return now
}

export default function MealPlanPage({ onAddToShoppingList }: MealPlanPageProps) {
  const { lang } = useLanguage()
        const tx = t[lang]
  const { showToast } = useToast()
  const navigate = useNavigate()
  const { recipes } = useRecipes()
  const [weekOffset, setWeekOffset] = useState(0)
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null)
  const [pickerRecipeId, setPickerSlug] = useState('')
  const [pickerMealType, setPickerMealType] = useState<MealType>('dinner')

  const days = useMemo(() => {
    const start = startOfWeek(weekOffset)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [weekOffset])

  const start = toIsoDate(days[0])
  const end = toIsoDate(days[6])
  const { entries, loading, addEntry, removeEntry } = useMealPlan(start, end)

  const mealTypeLabel: Record<MealType, string> = {
    breakfast: tx.breakfast,
    lunch: tx.lunch,
    dinner: tx.dinner,
    snack: tx.snack,
  }

  function recipeFor(slug: string) {
    return recipes.find(r => r.id === slug)
  }

  async function handleAdd(date: string) {
    if (!pickerRecipeId) return
    try {
      await addEntry(date, pickerRecipeId, pickerMealType)
      setPickerOpenFor(null)
      setPickerSlug('')
    } catch {
      showToast(tx.failedToAdd, 'error')
    }
  }

  function addWeekToShoppingList() {
    const items: { name: string; amount: number | null; unit: string }[] = []
    for (const entry of entries) {
      const recipe = recipeFor(entry.recipeId)
      if (!recipe) continue
      for (const group of recipe.ingredients) {
        for (const item of group.items) {
          const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
          items.push({ name: itemName, amount: item.amount || null, unit: item.unit })
        }
      }
    }
    onAddToShoppingList(items)
    showToast(lang === 'he' ? `${items.length} פריטים נוספו לרשימת הקניות` : `Added ${items.length} items to your shopping list`)
  }

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h1 className="font-serif text-2xl font-bold text-cream">
            {tx.mealPlan}
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset(w => w - 1)} className="btn-ghost text-xs">
              {tx.prevWeek}
            </button>
            <button type="button" onClick={() => setWeekOffset(0)} className="btn-ghost text-xs">
              {tx.thisWeek}
            </button>
            <button type="button" onClick={() => setWeekOffset(w => w + 1)} className="btn-ghost text-xs">
              {tx.nextWeek}
            </button>
          </div>
        </div>

        {entries.length > 0 && (
          <button type="button" onClick={addWeekToShoppingList} className="btn-primary text-xs mb-6">
            {tx.addThisWeekSIngredientsTo}
          </button>
        )}

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : (
          <div className="space-y-4">
            {days.map(day => {
              const iso = toIsoDate(day)
              const dayEntries = entries.filter(e => e.date === iso)
              return (
                <div key={iso} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-serif text-base font-medium text-cream">
                      {day.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </h2>
                    <button type="button"
                      onClick={() => { setPickerOpenFor(iso); setPickerSlug(''); setPickerMealType('dinner') }}
                      className="text-xs font-semibold text-amber hover:text-amber/80 transition-colors"
                    >
                      + {tx.addRecipe}
                    </button>
                  </div>

                  {dayEntries.length === 0 ? (
                    <p className="text-xs text-cream/25">{tx.nothingPlanned}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dayEntries.map(entry => {
                        const recipe = recipeFor(entry.recipeId)
                        return (
                          <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                            <button type="button"
                              onClick={() => navigate(`/recipes/${entry.recipeId}`)}
                              className="text-cream/70 hover:text-amber transition-colors text-start truncate"
                            >
                              <span className="text-cream/30 text-xs">{mealTypeLabel[entry.mealType]}</span>
                              {' · '}
                              {recipe ? (lang === 'he' ? (recipe.titleHe ?? recipe.title) : recipe.title) : entry.recipeId}
                            </button>
                            <button type="button"
                              onClick={() => removeEntry(entry.id)}
                              className="text-cream/25 hover:text-red-400 text-xs shrink-0"
                            >
                              ✕
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {pickerOpenFor === iso && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-tint/[0.06] pt-3">
                      <AppSelect
                        value={pickerRecipeId}
                        onValueChange={setPickerSlug}
                        triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg px-2 py-1.5 text-xs text-cream/80 outline-none focus:border-amber/30"
                        popupClassName="max-h-56"
                        aria-label={tx.selectRecipe2}
                        options={[
                          { value: '', label: tx.selectRecipe },
                          ...recipes.map(r => ({ value: r.id, label: lang === 'he' ? (r.titleHe ?? r.title) : r.title })),
                        ]}
                      />
                      <AppSelect
                        value={pickerMealType}
                        onValueChange={value => setPickerMealType(value as MealType)}
                        triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg px-2 py-1.5 text-xs text-cream/80 outline-none focus:border-amber/30"
                        options={MEAL_TYPES.map(mt => ({ value: mt, label: mealTypeLabel[mt] }))}
                      />
                      <button type="button" disabled={!pickerRecipeId} onClick={() => handleAdd(iso)} className="btn-primary text-xs disabled:opacity-40">
                        {tx.add}
                      </button>
                      <button type="button" onClick={() => setPickerOpenFor(null)} className="text-xs text-cream/40 hover:text-cream/70">
                        {tx.cancel}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
