import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import type { Category, Difficulty, IngredientGroup, Recipe, StepGroup } from '../types'
import { createRecipe, updateRecipe, type RecipeInput } from '../hooks/useRecipes'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'

interface RecipeFormProps {
  existing?: Recipe
  duplicateFrom?: Recipe
}

const CATEGORIES: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

function emptyIngredientGroup(): IngredientGroup {
  return { group: '', items: [{ amount: 0, unit: '', name: '' }] }
}

function emptyStepGroup(): StepGroup {
  return { title: '', items: [{ instruction: '' }] }
}

export default function RecipeForm({ existing, duplicateFrom }: RecipeFormProps) {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const tx = t[lang]
  const isEditing = !!existing
  const prefill = existing ?? duplicateFrom
  const titlePrefix = duplicateFrom ? (lang === 'he' ? 'העתק של ' : 'Copy of ') : ''

  const [title, setTitle] = useState(prefill ? `${titlePrefix}${prefill.title}` : '')
  const [titleHe, setTitleHe] = useState(prefill?.titleHe ? `${titlePrefix}${prefill.titleHe}` : '')
  const [category, setCategory] = useState<Category>(prefill?.category ?? 'dinner')
  const [difficulty, setDifficulty] = useState<Difficulty>(prefill?.difficulty ?? 'easy')
  const [cuisine, setCuisine] = useState(prefill?.cuisine ?? '')
  const [image, setImage] = useState(prefill?.image ?? '')
  const [description, setDescription] = useState(prefill?.description ?? '')
  const [descriptionEn, setDescriptionEn] = useState(prefill?.descriptionEn ?? '')
  const [prepTime, setPrepTime] = useState(prefill?.prepTime ?? 15)
  const [cookTime, setCookTime] = useState(prefill?.cookTime ?? 30)
  const [servings, setServings] = useState(prefill?.servings ?? 4)
  const [tags, setTags] = useState((prefill?.tags ?? []).join(', '))
  const [tips, setTips] = useState((prefill?.tips ?? []).join('\n'))
  const [featured, setFeatured] = useState(prefill?.featured ?? false)
  const [ingredientGroups, setIngredientGroups] = useState<IngredientGroup[]>(
    prefill?.ingredients?.length ? prefill.ingredients : [emptyIngredientGroup()]
  )
  const [stepGroups, setStepGroups] = useState<StepGroup[]>(
    prefill?.steps?.length ? prefill.steps : [emptyStepGroup()]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateIngredientGroup(gi: number, patch: Partial<IngredientGroup>) {
    setIngredientGroups(prev => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  }

  function updateIngredientItem(gi: number, ii: number, patch: Partial<IngredientGroup['items'][number]>) {
    setIngredientGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g
      return { ...g, items: g.items.map((item, j) => (j === ii ? { ...item, ...patch } : item)) }
    }))
  }

  function addIngredientItem(gi: number) {
    setIngredientGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: [...g.items, { amount: 0, unit: '', name: '' }] } : g
    )))
  }

  function removeIngredientItem(gi: number, ii: number) {
    setIngredientGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g
    )))
  }

  function addIngredientGroup() {
    setIngredientGroups(prev => [...prev, emptyIngredientGroup()])
  }

  function removeIngredientGroup(gi: number) {
    setIngredientGroups(prev => prev.filter((_, i) => i !== gi))
  }

  function updateStepGroup(gi: number, patch: Partial<StepGroup>) {
    setStepGroups(prev => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  }

  function updateStepItem(gi: number, si: number, patch: Partial<StepGroup['items'][number]>) {
    setStepGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g
      return { ...g, items: g.items.map((item, j) => (j === si ? { ...item, ...patch } : item)) }
    }))
  }

  function addStepItem(gi: number) {
    setStepGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: [...g.items, { instruction: '' }] } : g
    )))
  }

  function removeStepItem(gi: number, si: number) {
    setStepGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: g.items.filter((_, j) => j !== si) } : g
    )))
  }

  function addStepGroup() {
    setStepGroups(prev => [...prev, emptyStepGroup()])
  }

  function removeStepGroup(gi: number) {
    setStepGroups(prev => prev.filter((_, i) => i !== gi))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const input: RecipeInput = {
        title: title.trim(),
        titleHe: titleHe.trim() || undefined,
        category,
        difficulty,
        cuisine: cuisine.trim() || undefined,
        image: image.trim(),
        description: description.trim(),
        descriptionEn: descriptionEn.trim() || undefined,
        prepTime,
        cookTime,
        servings,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        tips: tips.split('\n').map(s => s.trim()).filter(Boolean),
        featured,
        ingredients: ingredientGroups
          .map(g => ({ ...g, items: g.items.filter(item => item.name.trim() !== '') }))
          .filter(g => g.items.length > 0),
        steps: stepGroups
          .map(g => ({ ...g, items: g.items.filter(item => item.instruction.trim() !== '') }))
          .filter(g => g.items.length > 0),
      }

      if (isEditing) {
        await updateRecipe(existing!.id, input, getToken)
        navigate(`/recipe/${existing!.id}`)
      } else {
        const slug = await createRecipe(input, getToken)
        navigate(`/recipe/${slug}`)
      }
    } catch {
      setError(lang === 'he' ? 'שמירת המתכון נכשלה. נסו שוב.' : 'Failed to save the recipe. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors'
  const labelClass = 'block text-xs font-semibold text-cream/50 mb-1'

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        <h1 className="font-serif text-2xl font-bold text-cream">
          {isEditing
            ? (lang === 'he' ? 'עריכת מתכון' : 'Edit Recipe')
            : duplicateFrom
              ? (lang === 'he' ? 'שכפול מתכון' : 'Duplicate Recipe')
              : (lang === 'he' ? 'מתכון חדש' : 'New Recipe')}
        </h1>

        {error && (
          <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>
        )}

        {/* Basics */}
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{lang === 'he' ? 'כותרת (אנגלית)' : 'Title (English)'}</label>
              <input required value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{lang === 'he' ? 'כותרת (עברית)' : 'Title (Hebrew)'}</label>
              <input value={titleHe} onChange={e => setTitleHe(e.target.value)} className={inputClass} dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>{lang === 'he' ? 'קטגוריה' : 'Category'}</label>
              <select value={category} onChange={e => setCategory(e.target.value as Category)} className={inputClass}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{categoryEmoji[c]} {tx.categories[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{lang === 'he' ? 'רמת קושי' : 'Difficulty'}</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className={inputClass}>
                {DIFFICULTIES.map(d => (
                  <option key={d} value={d}>{tx.difficulty[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{lang === 'he' ? 'מטבח' : 'Cuisine'}</label>
              <input value={cuisine} onChange={e => setCuisine(e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-cream/70">
                <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} />
                {lang === 'he' ? 'מומלץ' : 'Featured'}
              </label>
            </div>
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'קישור לתמונה' : 'Image URL'}</label>
            <input value={image} onChange={e => setImage(e.target.value)} className={inputClass} placeholder="https://assets.tugy.dev/..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{lang === 'he' ? 'תיאור (עברית)' : 'Description (Hebrew)'}</label>
              <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputClass} dir="rtl" />
            </div>
            <div>
              <label className={labelClass}>{lang === 'he' ? 'תיאור (אנגלית)' : 'Description (English)'}</label>
              <textarea value={descriptionEn} onChange={e => setDescriptionEn(e.target.value)} rows={2} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>{lang === 'he' ? 'הכנה (דק׳)' : 'Prep (min)'}</label>
              <input type="number" min={0} value={prepTime} onChange={e => setPrepTime(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{lang === 'he' ? 'בישול (דק׳)' : 'Cook (min)'}</label>
              <input type="number" min={0} value={cookTime} onChange={e => setCookTime(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{lang === 'he' ? 'מנות' : 'Servings'}</label>
              <input type="number" min={1} value={servings} onChange={e => setServings(Number(e.target.value))} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'תגיות (מופרדות בפסיק)' : 'Tags (comma-separated)'}</label>
            <input value={tags} onChange={e => setTags(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{lang === 'he' ? 'טיפים (שורה לכל טיפ)' : 'Tips (one per line)'}</label>
            <textarea value={tips} onChange={e => setTips(e.target.value)} rows={2} className={inputClass} />
          </div>
        </div>

        {/* Ingredients */}
        <div className="card p-5 space-y-4">
          <h2 className="font-serif text-lg font-bold text-cream">{tx.ingredients}</h2>
          {ingredientGroups.map((group, gi) => (
            <div key={gi} className="border border-tint/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  value={group.group ?? ''}
                  onChange={e => updateIngredientGroup(gi, { group: e.target.value })}
                  placeholder={lang === 'he' ? 'שם הקבוצה (אופציונלי)' : 'Group name (optional)'}
                  className={`${inputClass} flex-1`}
                />
                {ingredientGroups.length > 1 && (
                  <button type="button" onClick={() => removeIngredientGroup(gi)} className="text-xs text-red-400/70 hover:text-red-400 shrink-0">
                    {lang === 'he' ? 'הסר קבוצה' : 'Remove group'}
                  </button>
                )}
              </div>
              {group.items.map((item, ii) => (
                <div key={ii} className="grid grid-cols-12 gap-2 items-center">
                  <input type="number" value={item.amount ?? ''} onChange={e => updateIngredientItem(gi, ii, { amount: Number(e.target.value) })} className={`${inputClass} col-span-2`} placeholder={lang === 'he' ? 'כמות' : 'Qty'} />
                  <input value={item.unit ?? ''} onChange={e => updateIngredientItem(gi, ii, { unit: e.target.value })} className={`${inputClass} col-span-2`} placeholder={lang === 'he' ? 'יחידה' : 'Unit'} />
                  <input value={item.name} onChange={e => updateIngredientItem(gi, ii, { name: e.target.value })} className={`${inputClass} col-span-4`} placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'} />
                  <input value={item.nameEn ?? ''} onChange={e => updateIngredientItem(gi, ii, { nameEn: e.target.value })} className={`${inputClass} col-span-3`} placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'} />
                  <button type="button" onClick={() => removeIngredientItem(gi, ii)} className="col-span-1 text-red-400/60 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => addIngredientItem(gi)} className="text-xs text-amber hover:text-amber/80">
                + {lang === 'he' ? 'הוסף רכיב' : 'Add ingredient'}
              </button>
            </div>
          ))}
          <button type="button" onClick={addIngredientGroup} className="btn-ghost text-xs">
            + {lang === 'he' ? 'הוסף קבוצת רכיבים' : 'Add ingredient group'}
          </button>
        </div>

        {/* Steps */}
        <div className="card p-5 space-y-4">
          <h2 className="font-serif text-lg font-bold text-cream">{tx.instructions}</h2>
          {stepGroups.map((group, gi) => (
            <div key={gi} className="border border-tint/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  value={group.title ?? ''}
                  onChange={e => updateStepGroup(gi, { title: e.target.value })}
                  placeholder={lang === 'he' ? 'שם השלב (אופציונלי)' : 'Section title (optional)'}
                  className={`${inputClass} flex-1`}
                />
                {stepGroups.length > 1 && (
                  <button type="button" onClick={() => removeStepGroup(gi)} className="text-xs text-red-400/70 hover:text-red-400 shrink-0">
                    {lang === 'he' ? 'הסר קבוצה' : 'Remove group'}
                  </button>
                )}
              </div>
              {group.items.map((step, si) => (
                <div key={si} className="flex flex-col gap-2 border-t border-tint/[0.06] pt-3 first:border-t-0 first:pt-0">
                  <div className="flex gap-2">
                    <textarea
                      value={step.instruction}
                      onChange={e => updateStepItem(gi, si, { instruction: e.target.value })}
                      placeholder={lang === 'he' ? `שלב ${si + 1} (עברית)` : `Step ${si + 1} (Hebrew)`}
                      rows={2}
                      className={`${inputClass} flex-1`}
                      dir="rtl"
                    />
                    <button type="button" onClick={() => removeStepItem(gi, si)} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">✕</button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={step.timerMinutes ?? ''}
                      onChange={e => updateStepItem(gi, si, { timerMinutes: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder={lang === 'he' ? 'טיימר (דק׳)' : 'Timer (min)'}
                      className={`${inputClass} w-32`}
                    />
                    <input
                      value={step.tip ?? ''}
                      onChange={e => updateStepItem(gi, si, { tip: e.target.value })}
                      placeholder={lang === 'he' ? 'טיפ (אופציונלי)' : 'Tip (optional)'}
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addStepItem(gi)} className="text-xs text-amber hover:text-amber/80">
                + {lang === 'he' ? 'הוסף שלב' : 'Add step'}
              </button>
            </div>
          ))}
          <button type="button" onClick={addStepGroup} className="btn-ghost text-xs">
            + {lang === 'he' ? 'הוסף קבוצת שלבים' : 'Add step group'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving
              ? (lang === 'he' ? 'שומר...' : 'Saving...')
              : isEditing ? (lang === 'he' ? 'שמור שינויים' : 'Save changes') : (lang === 'he' ? 'צור מתכון' : 'Create recipe')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
        </div>
      </form>
    </div>
  )
}
