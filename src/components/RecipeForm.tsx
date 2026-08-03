import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Category, Difficulty, IngredientGroup, IngredientItem, Recipe, StepGroup, StepItem } from '../types'
import type { ImportedRecipe } from '../lib/recipeImport'
import { createRecipe, updateRecipe, type RecipeInput } from '../hooks/useRecipes'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { translateText } from '../lib/translate'
import SortableRow from './SortableRow'
import DragHandle from './DragHandle'

interface RecipeFormProps {
  existing?: Recipe
  duplicateFrom?: Recipe
  importedDraft?: ImportedRecipe
}

const CATEGORIES: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

// The editor needs a stable identity per row to drive drag-and-drop
// reordering, but the underlying Recipe data model has no id field on
// ingredient/step groups or items - _key is client-only state, stripped
// out again before the payload is sent to the API.
type Keyed<T> = T & { _key: string }
type LocalIngredientGroup = Omit<IngredientGroup, 'items'> & { _key: string; items: Keyed<IngredientItem>[] }
type LocalStepGroup = Omit<StepGroup, 'items'> & { _key: string; items: Keyed<StepItem>[] }

function makeKey(): string {
  return Math.random().toString(36).slice(2)
}

function keyIngredientGroup(g: IngredientGroup): LocalIngredientGroup {
  return { ...g, _key: makeKey(), items: g.items.map(item => ({ ...item, _key: makeKey() })) }
}

function keyStepGroup(g: StepGroup): LocalStepGroup {
  return { ...g, _key: makeKey(), items: g.items.map(item => ({ ...item, _key: makeKey() })) }
}

function emptyIngredientGroup(): LocalIngredientGroup {
  return keyIngredientGroup({ group: '', items: [{ amount: 0, unit: '', name: '' }] })
}

function emptyStepGroup(): LocalStepGroup {
  return keyStepGroup({ title: '', items: [{ instruction: '' }] })
}

function stripIngredientKeys(groups: LocalIngredientGroup[]): IngredientGroup[] {
  return groups.map(g => ({ group: g.group, groupEn: g.groupEn, items: g.items.map(item => omitKey(item)) }))
}

function stripStepKeys(groups: LocalStepGroup[]): StepGroup[] {
  return groups.map(g => ({ title: g.title, titleEn: g.titleEn, items: g.items.map(item => omitKey(item)) }))
}

function omitKey<T extends { _key: string }>(item: T): Omit<T, '_key'> {
  const copy: Record<string, unknown> = { ...item }
  delete copy._key
  return copy as Omit<T, '_key'>
}

function RegenerateButton({ lang, busy, onClick }: { lang: 'he' | 'en'; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={lang === 'he' ? 'תרגם מחדש' : 'Regenerate translation'}
      aria-label={lang === 'he' ? 'תרגם מחדש' : 'Regenerate translation'}
      className="shrink-0 text-cream/30 hover:text-amber disabled:opacity-40 transition-colors"
    >
      <svg className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  )
}

export default function RecipeForm({ existing, duplicateFrom, importedDraft }: RecipeFormProps) {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const tx = t[lang]
  const isEditing = !!existing
  const prefill = existing ?? duplicateFrom ?? importedDraft
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
  const [tipsEn, setTipsEn] = useState((prefill?.tipsEn ?? []).join('\n'))
  const [featured, setFeatured] = useState(prefill?.featured ?? false)
  const [ingredientGroups, setIngredientGroups] = useState<LocalIngredientGroup[]>(
    prefill?.ingredients?.length ? prefill.ingredients.map(keyIngredientGroup) : [emptyIngredientGroup()]
  )
  const [stepGroups, setStepGroups] = useState<LocalStepGroup[]>(
    prefill?.steps?.length ? prefill.steps.map(keyStepGroup) : [emptyStepGroup()]
  )
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Auto-fills the other-language field shortly after the user pauses
  // typing, but only when that field is still empty - it never overwrites
  // something the user already typed or a previous auto-fill.
  const translateTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  function scheduleAutoTranslate(key: string, text: string, targetLang: 'he' | 'en', apply: (translated: string) => void) {
    const existing = translateTimers.current.get(key)
    if (existing) clearTimeout(existing)
    if (!text.trim()) return
    const timer = setTimeout(async () => {
      const translated = await translateText(text, targetLang, getToken)
      if (translated) apply(translated)
    }, 900)
    translateTimers.current.set(key, timer)
  }

  // Manual "regenerate translation" button - unlike auto-fill, this always
  // overwrites the target field, using whichever source field currently
  // has content (Hebrew takes priority if both are filled).
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set())
  async function regenerateTranslation(key: string, heText: string, enText: string, setHe: (v: string) => void, setEn: (v: string) => void) {
    const existing = translateTimers.current.get(key)
    if (existing) clearTimeout(existing)
    setRegenerating(prev => new Set(prev).add(key))
    try {
      if (heText.trim()) {
        const translated = await translateText(heText, 'en', getToken)
        if (translated) setEn(translated)
      } else if (enText.trim()) {
        const translated = await translateText(enText, 'he', getToken)
        if (translated) setHe(translated)
      }
    } finally {
      setRegenerating(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  const [error, setError] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const uploadSlugRef = useRef(existing?.id ?? `new-${Date.now()}`)

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast(lang === 'he' ? 'סוג קובץ לא נתמך' : 'Unsupported file type', 'error')
      return
    }
    setPhotoUploading(true)
    try {
      const token = await getToken()
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ recipeSlug: uploadSlugRef.current, contentType: file.type, purpose: 'recipe' }),
      })
      if (!presignRes.ok) throw new Error('presign failed')
      const { uploadUrl, publicUrl } = await presignRes.json()
      const uploadResult = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!uploadResult.ok) throw new Error('upload failed')
      setImage(publicUrl)
    } catch {
      showToast(lang === 'he' ? 'העלאת התמונה נכשלה' : 'Photo upload failed', 'error')
    } finally {
      setPhotoUploading(false)
    }
  }

  function updateIngredientGroup(gi: number, patch: Partial<Omit<IngredientGroup, 'items'>>) {
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
      i === gi ? { ...g, items: [...g.items, { amount: 0, unit: '', name: '', _key: makeKey() }] } : g
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

  function reorderIngredientGroups(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setIngredientGroups(prev => {
      const oldIndex = prev.findIndex(g => g._key === active.id)
      const newIndex = prev.findIndex(g => g._key === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function reorderIngredientItems(gi: number, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setIngredientGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g
      const oldIndex = g.items.findIndex(item => item._key === active.id)
      const newIndex = g.items.findIndex(item => item._key === over.id)
      return { ...g, items: arrayMove(g.items, oldIndex, newIndex) }
    }))
  }

  function updateStepGroup(gi: number, patch: Partial<Omit<StepGroup, 'items'>>) {
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
      i === gi ? { ...g, items: [...g.items, { instruction: '', _key: makeKey() }] } : g
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

  function reorderStepGroups(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setStepGroups(prev => {
      const oldIndex = prev.findIndex(g => g._key === active.id)
      const newIndex = prev.findIndex(g => g._key === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function reorderStepItems(gi: number, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setStepGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g
      const oldIndex = g.items.findIndex(item => item._key === active.id)
      const newIndex = g.items.findIndex(item => item._key === over.id)
      return { ...g, items: arrayMove(g.items, oldIndex, newIndex) }
    }))
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
        tipsEn: tipsEn.split('\n').map(s => s.trim()).filter(Boolean),
        featured,
        ingredients: stripIngredientKeys(
          ingredientGroups
            .map(g => ({ ...g, items: g.items.filter(item => item.name.trim() !== '') }))
            .filter(g => g.items.length > 0)
        ),
        steps: stripStepKeys(
          stepGroups
            .map(g => ({ ...g, items: g.items.filter(item => item.instruction.trim() !== '') }))
            .filter(g => g.items.length > 0)
        ),
      }

      if (isEditing) {
        await updateRecipe(existing!.id, input, getToken)
        navigate(`/recipe/${existing!.id}`)
        showToast(lang === 'he' ? 'המתכון עודכן' : 'Recipe updated')
      } else {
        const slug = await createRecipe(input, getToken)
        navigate(`/recipe/${slug}`)
        showToast(lang === 'he' ? 'המתכון נוצר' : 'Recipe created')
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
              <input required value={title} onChange={e => { const v = e.target.value; setTitle(v); if (!titleHe.trim()) scheduleAutoTranslate('title', v, 'he', setTitleHe) }} className={inputClass} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{lang === 'he' ? 'כותרת (עברית)' : 'Title (Hebrew)'}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('title')} onClick={() => regenerateTranslation('title', titleHe, title, setTitleHe, setTitle)} />
              </div>
              <input value={titleHe} onChange={e => { const v = e.target.value; setTitleHe(v); if (!title.trim()) scheduleAutoTranslate('titleHe', v, 'en', setTitle) }} className={inputClass} dir="rtl" />
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
            <label className={labelClass}>{lang === 'he' ? 'תמונה' : 'Photo'}</label>
            <label className="relative block w-full h-48 rounded-xl overflow-hidden border border-tint/10 bg-tint/[0.03] cursor-pointer group">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelected} disabled={photoUploading} className="hidden" />
              {image ? (
                <img src={image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-cream/25">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">{lang === 'he' ? 'העלה תמונה' : 'Upload a photo'}</span>
                </div>
              )}
              <div className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                photoUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}>
                <span className="text-xs font-semibold text-white">
                  {photoUploading
                    ? (lang === 'he' ? 'מעלה...' : 'Uploading...')
                    : image
                      ? (lang === 'he' ? 'החלף תמונה' : 'Swap photo')
                      : (lang === 'he' ? 'העלה תמונה' : 'Upload photo')}
                </span>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{lang === 'he' ? 'תיאור (עברית)' : 'Description (Hebrew)'}</label>
              <textarea required value={description} onChange={e => { const v = e.target.value; setDescription(v); if (!descriptionEn.trim()) scheduleAutoTranslate('description', v, 'en', setDescriptionEn) }} rows={2} className={inputClass} dir="rtl" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{lang === 'he' ? 'תיאור (אנגלית)' : 'Description (English)'}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('description')} onClick={() => regenerateTranslation('description', description, descriptionEn, setDescription, setDescriptionEn)} />
              </div>
              <textarea value={descriptionEn} onChange={e => { const v = e.target.value; setDescriptionEn(v); if (!description.trim()) scheduleAutoTranslate('descriptionEn', v, 'he', setDescription) }} rows={2} className={inputClass} />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{lang === 'he' ? 'טיפים (עברית, שורה לכל טיפ)' : 'Tips (Hebrew, one per line)'}</label>
              <textarea value={tips} onChange={e => { const v = e.target.value; setTips(v); if (!tipsEn.trim()) scheduleAutoTranslate('tips', v, 'en', setTipsEn) }} rows={2} className={inputClass} dir="rtl" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{lang === 'he' ? 'טיפים (אנגלית, שורה לכל טיפ)' : 'Tips (English, one per line)'}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('tips')} onClick={() => regenerateTranslation('tips', tips, tipsEn, setTips, setTipsEn)} />
              </div>
              <textarea value={tipsEn} onChange={e => { const v = e.target.value; setTipsEn(v); if (!tips.trim()) scheduleAutoTranslate('tipsEn', v, 'he', setTips) }} rows={2} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div className="card p-5 space-y-4">
          <h2 className="font-serif text-lg font-bold text-cream">{tx.ingredients}</h2>
          <DndContext sensors={sensors} onDragEnd={reorderIngredientGroups}>
            <SortableContext items={ingredientGroups.map(g => g._key)} strategy={verticalListSortingStrategy}>
              {ingredientGroups.map((group, gi) => (
                <SortableRow key={group._key} id={group._key} className="border border-tint/10 rounded-xl p-4 space-y-3">
                  {({ attributes, listeners }) => (
                    <>
                      <div className="flex items-center gap-2">
                        <DragHandle attributes={attributes} listeners={listeners} />
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
                      <DndContext sensors={sensors} onDragEnd={event => reorderIngredientItems(gi, event)}>
                        <SortableContext items={group.items.map(item => item._key)} strategy={verticalListSortingStrategy}>
                          {group.items.map((item, ii) => (
                            <SortableRow key={item._key} id={item._key}>
                              {({ attributes: itemAttrs, listeners: itemListeners }) => (
                                <div className="flex items-center gap-2">
                                  <DragHandle attributes={itemAttrs} listeners={itemListeners} />
                                  <div className="grid grid-cols-12 gap-2 items-center flex-1">
                                    <input type="number" step="any" value={item.amount ?? ''} onChange={e => updateIngredientItem(gi, ii, { amount: Number(e.target.value) })} className={`${inputClass} col-span-2`} placeholder={lang === 'he' ? 'כמות' : 'Qty'} />
                                    <input value={item.unit ?? ''} onChange={e => updateIngredientItem(gi, ii, { unit: e.target.value })} className={`${inputClass} col-span-2`} placeholder={lang === 'he' ? 'יחידה' : 'Unit'} />
                                    <input value={item.name} onChange={e => { const v = e.target.value; updateIngredientItem(gi, ii, { name: v }); if (!(item.nameEn ?? '').trim()) scheduleAutoTranslate(`ing-${item._key}`, v, 'en', translated => updateIngredientItem(gi, ii, { nameEn: translated })) }} className={`${inputClass} col-span-4`} placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'} />
                                    <input value={item.nameEn ?? ''} onChange={e => { const v = e.target.value; updateIngredientItem(gi, ii, { nameEn: v }); if (!item.name.trim()) scheduleAutoTranslate(`ingEn-${item._key}`, v, 'he', translated => updateIngredientItem(gi, ii, { name: translated })) }} className={`${inputClass} col-span-3`} placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'} />
                                    <button type="button" onClick={() => removeIngredientItem(gi, ii)} className="col-span-1 text-red-400/60 hover:text-red-400 text-xs">✕</button>
                                  </div>
                                  <RegenerateButton
                                    lang={lang}
                                    busy={regenerating.has(`ing-${item._key}`)}
                                    onClick={() => regenerateTranslation(`ing-${item._key}`, item.name, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { name: v }), v => updateIngredientItem(gi, ii, { nameEn: v }))}
                                  />
                                </div>
                              )}
                            </SortableRow>
                          ))}
                        </SortableContext>
                      </DndContext>
                      <button type="button" onClick={() => addIngredientItem(gi)} className="text-xs text-amber hover:text-amber/80">
                        + {lang === 'he' ? 'הוסף רכיב' : 'Add ingredient'}
                      </button>
                    </>
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" onClick={addIngredientGroup} className="btn-ghost text-xs">
            + {lang === 'he' ? 'הוסף קבוצת רכיבים' : 'Add ingredient group'}
          </button>
        </div>

        {/* Steps */}
        <div className="card p-5 space-y-4">
          <h2 className="font-serif text-lg font-bold text-cream">{tx.instructions}</h2>
          <DndContext sensors={sensors} onDragEnd={reorderStepGroups}>
            <SortableContext items={stepGroups.map(g => g._key)} strategy={verticalListSortingStrategy}>
              {stepGroups.map((group, gi) => (
                <SortableRow key={group._key} id={group._key} className="border border-tint/10 rounded-xl p-4 space-y-3">
                  {({ attributes, listeners }) => (
                    <>
                      <div className="flex items-center gap-2">
                        <DragHandle attributes={attributes} listeners={listeners} />
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
                      <DndContext sensors={sensors} onDragEnd={event => reorderStepItems(gi, event)}>
                        <SortableContext items={group.items.map(item => item._key)} strategy={verticalListSortingStrategy}>
                          {group.items.map((step, si) => (
                            <SortableRow key={step._key} id={step._key} className="border-t border-tint/[0.06] pt-3 first:border-t-0 first:pt-0">
                              {({ attributes: itemAttrs, listeners: itemListeners }) => (
                                <div className="flex gap-2">
                                  <DragHandle attributes={itemAttrs} listeners={itemListeners} className="mt-2" />
                                  <div className="flex flex-col gap-2 flex-1">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <textarea
                                        value={step.instruction}
                                        onChange={e => { const v = e.target.value; updateStepItem(gi, si, { instruction: v }); if (!(step.instructionEn ?? '').trim()) scheduleAutoTranslate(`step-${step._key}`, v, 'en', translated => updateStepItem(gi, si, { instructionEn: translated })) }}
                                        placeholder={lang === 'he' ? `שלב ${si + 1} (עברית)` : `Step ${si + 1} (Hebrew)`}
                                        rows={2}
                                        className={inputClass}
                                        dir="rtl"
                                      />
                                      <textarea
                                        value={step.instructionEn ?? ''}
                                        onChange={e => { const v = e.target.value; updateStepItem(gi, si, { instructionEn: v }); if (!step.instruction.trim()) scheduleAutoTranslate(`stepEn-${step._key}`, v, 'he', translated => updateStepItem(gi, si, { instruction: translated })) }}
                                        placeholder={lang === 'he' ? `שלב ${si + 1} (אנגלית)` : `Step ${si + 1} (English)`}
                                        rows={2}
                                        className={inputClass}
                                      />
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <RegenerateButton
                                        lang={lang}
                                        busy={regenerating.has(`step-${step._key}`)}
                                        onClick={() => regenerateTranslation(`step-${step._key}`, step.instruction, step.instructionEn ?? '', v => updateStepItem(gi, si, { instruction: v }), v => updateStepItem(gi, si, { instructionEn: v }))}
                                      />
                                      <button type="button" onClick={() => removeStepItem(gi, si)} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">✕ {lang === 'he' ? 'הסר שלב' : 'Remove step'}</button>
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
                                </div>
                              )}
                            </SortableRow>
                          ))}
                        </SortableContext>
                      </DndContext>
                      <button type="button" onClick={() => addStepItem(gi)} className="text-xs text-amber hover:text-amber/80">
                        + {lang === 'he' ? 'הוסף שלב' : 'Add step'}
                      </button>
                    </>
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
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
