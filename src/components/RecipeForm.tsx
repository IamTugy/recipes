import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Category, Difficulty, IngredientGroup, IngredientItem, KosherType, Nutrition, QualityFinding, Recipe, StepGroup, StepItem } from '../types'
import { createRecipe, updateRecipe, type RecipeInput } from '../hooks/useRecipes'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { translateText } from '../lib/translate'
import { estimateNutrition } from '../lib/recipeNutrition'
import { useHistoryStack } from '../hooks/useHistoryStack'
import ConfirmDialog from './ConfirmDialog'
import SortableRow from './SortableRow'
import DragHandle from './DragHandle'
import EditableImageField from './EditableImageField'
import Breadcrumbs from './Breadcrumbs'
import AppSelect from './ui/AppSelect'
import FilterInfoPopover from './FilterInfoPopover'
import AiDraftsPanel from './AiDraftsPanel'
import RecipeLinkPicker from './RecipeLinkPicker'
import LinkedIngredientDisplay from './LinkedIngredientDisplay'

interface RecipeFormProps {
  existing?: Recipe
  // The last AI review's findings, shown as a checklist while editing so
  // issues without an auto-applied suggestedFields fix (e.g. "photo is
  // blurry") don't silently linger past the fields that did get prefilled -
  // resubmitting without addressing those just gets rejected again.
  reviewFindings?: QualityFinding[]
  appliedFindingIndices?: number[]
  scrollToFieldOnMount?: string
}

const CATEGORIES: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const KOSHER_TYPES: KosherType[] = ['meat', 'dairy', 'parve']

// The editor needs a stable identity per row to drive drag-and-drop
// reordering, but the underlying Recipe data model has no id field on
// ingredient/step groups or items - _key is client-only state, stripped
// out again before the payload is sent to the API.
type Keyed<T> = T & { _key: string }
type LocalIngredientGroup = Omit<IngredientGroup, 'items'> & { _key: string; items: Keyed<IngredientItem>[] }
type LocalStepGroup = Omit<StepGroup, 'items'> & { _key: string; items: Keyed<StepItem>[] }

// Everything the undo/redo stack tracks - every editable field except
// transient UI state (saving/error/estimatingNutrition/regenerating), which
// undoing shouldn't touch.
interface DraftSnapshot {
  title: string
  titleHe: string
  category: Category
  difficulty: Difficulty
  kosherType: KosherType | ''
  cuisine: string
  image: string
  description: string
  descriptionEn: string
  prepTime: number
  cookTime: number
  servings: number
  nutrition: Nutrition
  tags: string
  tagsEn: string
  tips: string
  tipsEn: string
  sources: { title: string; url: string }[]
  ingredientGroups: LocalIngredientGroup[]
  stepGroups: LocalStepGroup[]
}

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
  const tx = t[lang]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={tx.regenerateTranslation}
      className="shrink-0 flex items-center gap-1 text-xs font-medium text-cream/40 hover:text-amber disabled:opacity-40 transition-colors"
    >
      <svg className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {tx.translate}
    </button>
  )
}

export default function RecipeForm({ existing, reviewFindings, appliedFindingIndices, scrollToFieldOnMount }: RecipeFormProps) {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const tx = t[lang]
  const isEditing = !!existing
  const prefill = existing

  const [title, setTitle] = useState(prefill?.title ?? '')
  const [titleHe, setTitleHe] = useState(prefill?.titleHe ?? '')
  const [category, setCategory] = useState<Category>(prefill?.category ?? 'dinner')
  const [difficulty, setDifficulty] = useState<Difficulty>(prefill?.difficulty ?? 'easy')
  const [kosherType, setKosherType] = useState<KosherType | ''>(prefill?.kosherType ?? '')
  const [cuisine, setCuisine] = useState(prefill?.cuisine ?? '')
  const [image, setImage] = useState(prefill?.image ?? '')
  const [description, setDescription] = useState(prefill?.description ?? '')
  const [descriptionEn, setDescriptionEn] = useState(prefill?.descriptionEn ?? '')
  const [prepTime, setPrepTime] = useState(prefill?.prepTime ?? 15)
  const [cookTime, setCookTime] = useState(prefill?.cookTime ?? 30)
  const [servings, setServings] = useState(prefill?.servings ?? 4)
  const [nutrition, setNutrition] = useState<Nutrition>(prefill?.nutrition ?? {})
  const [estimatingNutrition, setEstimatingNutrition] = useState(false)
  const [tags, setTags] = useState((prefill?.tags ?? []).join(', '))
  const [tagsEn, setTagsEn] = useState((prefill?.tagsEn ?? []).join(', '))
  const [tips, setTips] = useState((prefill?.tips ?? []).join('\n'))
  const [tipsEn, setTipsEn] = useState((prefill?.tipsEn ?? []).join('\n'))
  const aiGenerated = prefill?.aiGenerated ?? false
  const [sources, setSources] = useState(prefill?.sources ?? [])
  const [ingredientGroups, setIngredientGroups] = useState<LocalIngredientGroup[]>(
    prefill?.ingredients?.length ? prefill.ingredients.map(keyIngredientGroup) : [emptyIngredientGroup()]
  )
  const [stepGroups, setStepGroups] = useState<LocalStepGroup[]>(
    prefill?.steps?.length ? prefill.steps.map(keyStepGroup) : [emptyStepGroup()]
  )
  const [saving, setSaving] = useState(false)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Clicking a finding in the "from the last AI review" list below scrolls
  // to and briefly highlights the field it's about, so the owner doesn't
  // have to hunt for which input a comment refers to. Fields are matched by
  // id="field-<name>" set on each field's wrapper div.
  const [highlightedField, setHighlightedField] = useState<string | null>(null)
  useEffect(() => {
    if (!highlightedField) return
    const timer = setTimeout(() => setHighlightedField(null), 1600)
    return () => clearTimeout(timer)
  }, [highlightedField])
  function scrollToField(field: string) {
    const el = document.getElementById(`field-${field}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedField(field)
  }
  function fieldHighlightClass(field: string) {
    return highlightedField === field ? 'ring-2 ring-amber rounded-lg transition-shadow' : ''
  }
  // Arrived here via a finding's "go to location" button on the recipe
  // page rather than by clicking within this form - scroll once the form
  // (and, for deep ingredient/step fields, its dynamic rows) has mounted.
  useEffect(() => {
    if (!scrollToFieldOnMount) return
    const timer = setTimeout(() => scrollToField(scrollToFieldOnMount), 100)
    return () => clearTimeout(timer)
  }, [scrollToFieldOnMount])

  function snapshotDraft(): DraftSnapshot {
    return {
      title, titleHe, category, difficulty, kosherType, cuisine, image, description, descriptionEn,
      prepTime, cookTime, servings, nutrition, tags, tagsEn, tips, tipsEn, sources, ingredientGroups, stepGroups,
    }
  }

  function restoreDraft(s: DraftSnapshot) {
    setTitle(s.title); setTitleHe(s.titleHe); setCategory(s.category); setDifficulty(s.difficulty)
    setKosherType(s.kosherType); setCuisine(s.cuisine); setImage(s.image); setDescription(s.description)
    setDescriptionEn(s.descriptionEn); setPrepTime(s.prepTime); setCookTime(s.cookTime); setServings(s.servings)
    setNutrition(s.nutrition); setTags(s.tags); setTagsEn(s.tagsEn); setTips(s.tips); setTipsEn(s.tipsEn); setSources(s.sources)
    setIngredientGroups(s.ingredientGroups); setStepGroups(s.stepGroups)
  }

  const history = useHistoryStack<DraftSnapshot>()
  // Call right before applying a change that should be its own undo step -
  // every add/remove/reorder action, an image change, a translate-regenerate
  // result, or a text field losing focus with a changed value. Never called
  // per-keystroke (that would make every character its own undo step).
  function commitHistory() {
    history.commit(snapshotDraft())
  }
  function undo() { history.undo(snapshotDraft(), restoreDraft) }
  function redo() { history.redo(snapshotDraft(), restoreDraft) }

  // Undo/redo keyboard shortcuts - only when focus isn't inside a text
  // field, so the browser's own native per-field undo takes priority while
  // actively typing; the app-level stack takes over once focus leaves it.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isTyping) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Warn on tab close/refresh when there are unsaved changes - in-app
  // navigation (Cancel button) is handled separately via exitConfirmOpen,
  // since beforeunload can't show a custom confirm dialog.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!history.canUndo) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [history.canUndo])

  // Tracks which translatable fields the user has typed into directly
  // (vs auto-filled/AI-filled content never touched by hand) - see
  // handleFieldBlur. Never includes a field whose value came only from
  // auto-fill or a regenerate-translation result.
  const touchedFields = useRef<Set<string>>(new Set())

  // Refs backing the shared per-field focus/blur bookkeeping in
  // fieldBindings() below - only one field can be focused at a time in a
  // form, so a single set of refs (not a per-key map) is enough.
  const focusedKeyRef = useRef<string | null>(null)
  const focusedValueRef = useRef<string>('')
  const focusedSnapshotRef = useRef<DraftSnapshot | null>(null)

  // Shared value/onChange/onFocus/onBlur bindings for every translatable
  // text field. onChange marks the field as user-touched (so it's never
  // silently overwritten again) and updates the value live, without
  // pushing an undo step per keystroke. onFocus snapshots the whole draft.
  // onBlur does two independent things: (1) if the value actually changed
  // since focus, commits that pre-change snapshot as one undo step; (2)
  // translates into the counterpart field - always when the counterpart is
  // empty, and also when the counterpart is non-empty but was never
  // touched by hand (keeps an untouched auto-filled field in sync); never
  // when the counterpart was touched directly (respects the manual edit).
  function fieldBindings(
    key: string, value: string, setValue: (v: string) => void,
    counterpartKey: string, counterpartValue: string, setCounterpart: (v: string) => void,
    targetLang: 'he' | 'en'
  ) {
    return {
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        touchedFields.current.add(key)
        setValue(e.target.value)
      },
      onFocus: () => {
        focusedKeyRef.current = key
        focusedValueRef.current = value
        focusedSnapshotRef.current = snapshotDraft()
      },
      onBlur: async () => {
        if (focusedKeyRef.current === key && focusedValueRef.current !== value && focusedSnapshotRef.current) {
          history.commit(focusedSnapshotRef.current)
        }
        focusedKeyRef.current = null
        if (!value.trim()) return
        if (counterpartValue.trim() && touchedFields.current.has(counterpartKey)) return
        const translated = await translateText(value, targetLang, getToken)
        if (translated) setCounterpart(translated)
      },
    }
  }

  // Manual "regenerate translation" button - unlike auto-fill, this always
  // overwrites the target field, using whichever source field currently
  // has content (Hebrew takes priority if both are filled). One undo step.
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set())
  async function regenerateTranslation(key: string, heText: string, enText: string, setHe: (v: string) => void, setEn: (v: string) => void) {
    setRegenerating(prev => new Set(prev).add(key))
    try {
      const before = snapshotDraft()
      if (heText.trim()) {
        const translated = await translateText(heText, 'en', getToken)
        if (translated) { history.commit(before); setEn(translated) }
      } else if (enText.trim()) {
        const translated = await translateText(enText, 'he', getToken)
        if (translated) { history.commit(before); setHe(translated) }
      }
    } finally {
      setRegenerating(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  const [error, setError] = useState<string | null>(null)
  const [linkPickerFor, setLinkPickerFor] = useState<{ gi: number; ii: number } | null>(null)
  const uploadRecipeIdRef = useRef(existing?.id ?? `new-${Date.now()}`)

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
    commitHistory()
    setIngredientGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: [...g.items, { amount: 0, unit: '', name: '', _key: makeKey() }] } : g
    )))
  }

  function removeIngredientItem(gi: number, ii: number) {
    commitHistory()
    setIngredientGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g
    )))
  }

  function addIngredientGroup() {
    commitHistory()
    setIngredientGroups(prev => [...prev, emptyIngredientGroup()])
  }

  function removeIngredientGroup(gi: number) {
    commitHistory()
    setIngredientGroups(prev => prev.filter((_, i) => i !== gi))
  }

  function reorderIngredientGroups(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commitHistory()
    setIngredientGroups(prev => {
      const oldIndex = prev.findIndex(g => g._key === active.id)
      const newIndex = prev.findIndex(g => g._key === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function reorderIngredientItems(gi: number, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commitHistory()
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
    commitHistory()
    setStepGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: [...g.items, { instruction: '', _key: makeKey() }] } : g
    )))
  }

  function removeStepItem(gi: number, si: number) {
    commitHistory()
    setStepGroups(prev => prev.map((g, i) => (
      i === gi ? { ...g, items: g.items.filter((_, j) => j !== si) } : g
    )))
  }

  function addStepGroup() {
    commitHistory()
    setStepGroups(prev => [...prev, emptyStepGroup()])
  }

  function removeStepGroup(gi: number) {
    commitHistory()
    setStepGroups(prev => prev.filter((_, i) => i !== gi))
  }

  function reorderStepGroups(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commitHistory()
    setStepGroups(prev => {
      const oldIndex = prev.findIndex(g => g._key === active.id)
      const newIndex = prev.findIndex(g => g._key === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function reorderStepItems(gi: number, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    commitHistory()
    setStepGroups(prev => prev.map((g, i) => {
      if (i !== gi) return g
      const oldIndex = g.items.findIndex(item => item._key === active.id)
      const newIndex = g.items.findIndex(item => item._key === over.id)
      return { ...g, items: arrayMove(g.items, oldIndex, newIndex) }
    }))
  }

  async function handleEstimateNutrition() {
    const ingredients = stripIngredientKeys(
      ingredientGroups
        .map(g => ({ ...g, items: g.items.filter(item => item.name.trim() !== '') }))
        .filter(g => g.items.length > 0)
    )
    if (ingredients.length === 0) {
      showToast(tx.addIngredientsBeforeEstimatingNutrition, 'error')
      return
    }
    setEstimatingNutrition(true)
    try {
      const estimate = await estimateNutrition(ingredients, servings, getToken)
      if (estimate) {
        commitHistory()
        setNutrition(estimate)
      } else {
        showToast(tx.nutritionEstimateFailed, 'error')
      }
    } finally {
      setEstimatingNutrition(false)
    }
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
        kosherType: kosherType || undefined,
        cuisine: cuisine.trim() || undefined,
        image: image.trim(),
        description: description.trim(),
        descriptionEn: descriptionEn.trim() || undefined,
        prepTime,
        cookTime,
        servings,
        nutrition: Object.values(nutrition).some(v => v !== undefined) ? nutrition : undefined,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
        tagsEn: tagsEn.split(',').map(s => s.trim()).filter(Boolean),
        tips: tips.split('\n').map(s => s.trim()).filter(Boolean),
        tipsEn: tipsEn.split('\n').map(s => s.trim()).filter(Boolean),
        aiGenerated,
        sources: sources.filter(s => s.title.trim() && s.url.trim()),
        ingredients: stripIngredientKeys(
          ingredientGroups
            .map(g => ({ ...g, items: g.items.filter(item => item.name.trim() !== '' || item.linkedRecipeId) }))
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
        navigate(`/recipes/${existing!.id}`)
        showToast(tx.recipeUpdated)
      } else {
        const newId = await createRecipe(input, getToken)
        navigate(`/recipes/${newId}`)
        showToast(tx.recipeCreated)
      }
    } catch {
      setError(tx.failedToSaveTheRecipePlease)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none'
  const labelClass = 'block text-xs font-semibold text-cream/50 mb-1'

  const displayTitle = (lang === 'he' ? titleHe : title) || title || titleHe

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <AiDraftsPanel />
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        <Breadcrumbs crumbs={
          isEditing
            ? [
                { label: tx.home, href: '/' },
                { label: displayTitle || (tx.recipe), href: `/recipes/${existing!.id}` },
                { label: tx.edit2 },
              ]
            : [
                { label: tx.home, href: '/' },
                { label: tx.newRecipe2 },
              ]
        } />
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-cream">
            {isEditing
              ? (tx.editRecipe2)
              : (tx.newRecipe2)}
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={undo}
              disabled={!history.canUndo}
              title={tx.undo}
              className="p-2 rounded-lg text-cream/60 hover:text-cream hover:bg-tint/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!history.canRedo}
              title={tx.redo}
              className="p-2 rounded-lg text-cream/60 hover:text-cream hover:bg-tint/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
              </svg>
            </button>
          </div>
        </div>

        {reviewFindings && reviewFindings.length > 0 && (
          <div className="card p-4 border border-amber/20 space-y-2">
            <p className="text-sm font-semibold text-cream">
              {tx.fromTheLastAIReview}
            </p>
            <ul className="space-y-1.5">
              {reviewFindings.map((f, i) => {
                const autoFixed = !!appliedFindingIndices?.includes(i)
                return (
                  <li key={i} className="text-xs text-cream/60">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        autoFixed ? 'bg-herb/10 text-herb'
                        : f.severity === 'critical' ? 'bg-red-500/10 text-red-400'
                        : f.severity === 'major' ? 'bg-amber/10 text-amber'
                        : 'bg-tint/10 text-cream/50'
                      }`}>
                        {autoFixed ? (tx.autoFixed) : f.severity}
                      </span>
                      {f.field && (
                        <button
                          type="button"
                          title={tx.goToFieldLocation}
                          onClick={() => scrollToField(f.field!)}
                          className="text-cream/40 hover:text-cream/80 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="mt-1 ps-6">{f.message}{autoFixed ? (tx.doubleCheckTheFixBelow) : ''}</p>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {aiGenerated && (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber bg-amber/10 border border-amber/20 rounded-full px-3 py-1">
            <span>{tx.aICoAuthored}</span>
            <FilterInfoPopover text={tx.thisRecipeWasCoAuthoredWith2}
            />
          </div>
        )}

        {error && (
          <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>
        )}

        {/* Basics */}
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="field-title" className={fieldHighlightClass('title')}>
              <label className={labelClass}>{tx.titleEnglish}</label>
              <input required {...fieldBindings('title', title, setTitle, 'titleHe', titleHe, setTitleHe, 'he')} className={inputClass} />
            </div>
            <div id="field-titleHe" className={fieldHighlightClass('titleHe')}>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{tx.titleHebrew}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('title')} onClick={() => regenerateTranslation('title', titleHe, title, setTitleHe, setTitle)} />
              </div>
              <input {...fieldBindings('titleHe', titleHe, setTitleHe, 'title', title, setTitle, 'en')} className={inputClass} dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div id="field-category" className={fieldHighlightClass('category')}>
              <label className={labelClass}>{tx.category}</label>
              <AppSelect
                value={category}
                onValueChange={value => setCategory(value as Category)}
                triggerClassName={inputClass}
                options={CATEGORIES.map(c => ({ value: c, label: `${categoryEmoji[c]} ${tx.categories[c]}` }))}
              />
            </div>
            <div id="field-difficulty" className={fieldHighlightClass('difficulty')}>
              <label className={labelClass}>{tx.difficulty2}</label>
              <AppSelect
                value={difficulty}
                onValueChange={value => setDifficulty(value as Difficulty)}
                triggerClassName={inputClass}
                options={DIFFICULTIES.map(d => ({ value: d, label: tx.difficulty[d] }))}
              />
            </div>
            <div id="field-cuisine" className={fieldHighlightClass('cuisine')}>
              <label className={labelClass}>{tx.cuisine}</label>
              <input value={cuisine} onChange={e => setCuisine(e.target.value)} className={inputClass} />
            </div>
            <div id="field-kosherType" className={fieldHighlightClass('kosherType')}>
              <label className={labelClass} title={tx.kosherClassificationMeatDairyOrParve}>
                {tx.kosher}
              </label>
              <AppSelect
                value={kosherType || 'unset'}
                onValueChange={value => setKosherType(value === 'unset' ? '' : value as KosherType)}
                triggerClassName={inputClass}
                options={[
                  { value: 'unset', label: tx.notSet },
                  ...KOSHER_TYPES.map(k => ({ value: k, label: tx.kosherType[k] })),
                ]}
              />
            </div>
          </div>

          <div id="field-image" className={fieldHighlightClass('image')}>
            <label className={labelClass}>{tx.photo}</label>
            <EditableImageField
              image={image}
              onChange={url => { commitHistory(); setImage(url ?? '') }}
              uploadRecipeId={uploadRecipeIdRef.current}
              recipeId={existing?.id}
              lang={lang}
              onError={message => showToast(message, 'error')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="field-description" className={fieldHighlightClass('description')}>
              <label className={labelClass}>{tx.descriptionHebrew}</label>
              <textarea required {...fieldBindings('description', description, setDescription, 'descriptionEn', descriptionEn, setDescriptionEn, 'en')} rows={2} className={inputClass} dir="rtl" />
            </div>
            <div id="field-descriptionEn" className={fieldHighlightClass('descriptionEn')}>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{tx.descriptionEnglish}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('description')} onClick={() => regenerateTranslation('description', description, descriptionEn, setDescription, setDescriptionEn)} />
              </div>
              <textarea {...fieldBindings('descriptionEn', descriptionEn, setDescriptionEn, 'description', description, setDescription, 'he')} rows={2} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div id="field-prepTime" className={fieldHighlightClass('prepTime')}>
              <label className={labelClass}>{tx.prepMin}</label>
              <input type="number" min={0} value={prepTime} onChange={e => setPrepTime(Number(e.target.value))} className={inputClass} />
            </div>
            <div id="field-cookTime" className={fieldHighlightClass('cookTime')}>
              <label className={labelClass}>{tx.cookMin}</label>
              <input type="number" min={0} value={cookTime} onChange={e => setCookTime(Number(e.target.value))} className={inputClass} />
            </div>
            <div id="field-servings" className={fieldHighlightClass('servings')}>
              <label className={labelClass}>{tx.servings}</label>
              <input type="number" min={1} value={servings} onChange={e => setServings(Number(e.target.value))} className={inputClass} />
            </div>
          </div>

          <div id="field-nutrition" className={fieldHighlightClass('nutrition')}>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>{tx.nutritionPer100g}</label>
              <button
                type="button"
                onClick={handleEstimateNutrition}
                disabled={estimatingNutrition}
                className="text-xs text-amber hover:text-amber/80 disabled:opacity-40"
              >
                {estimatingNutrition
                  ? (tx.estimating)
                  : Object.values(nutrition).some(v => v !== undefined)
                    ? (tx.reEstimateWithAI)
                    : (tx.estimateWithAI)}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>{tx.calories}</label>
                <input type="number" min={0} step="any" value={nutrition.calories ?? ''} onChange={e => setNutrition(n => ({ ...n, calories: e.target.value ? Number(e.target.value) : undefined }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{tx.proteinG}</label>
                <input type="number" min={0} step="any" value={nutrition.protein ?? ''} onChange={e => setNutrition(n => ({ ...n, protein: e.target.value ? Number(e.target.value) : undefined }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{tx.carbsG}</label>
                <input type="number" min={0} step="any" value={nutrition.carbs ?? ''} onChange={e => setNutrition(n => ({ ...n, carbs: e.target.value ? Number(e.target.value) : undefined }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{tx.fatG}</label>
                <input type="number" min={0} step="any" value={nutrition.fat ?? ''} onChange={e => setNutrition(n => ({ ...n, fat: e.target.value ? Number(e.target.value) : undefined }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{tx.estServingWeightG}</label>
                <input type="number" min={0} value={nutrition.servingWeight ?? ''} onChange={e => setNutrition(n => ({ ...n, servingWeight: e.target.value ? Number(e.target.value) : undefined }))} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="field-tags" className={fieldHighlightClass('tags')}>
              <label className={labelClass}>{tx.tagsHebrewCommaSeparated}</label>
              <input {...fieldBindings('tags', tags, setTags, 'tagsEn', tagsEn, setTagsEn, 'en')} className={inputClass} dir="rtl" />
            </div>
            <div id="field-tagsEn" className={fieldHighlightClass('tagsEn')}>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{tx.tagsEnglishCommaSeparated}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('tags')} onClick={() => regenerateTranslation('tags', tags, tagsEn, setTags, setTagsEn)} />
              </div>
              <input {...fieldBindings('tagsEn', tagsEn, setTagsEn, 'tags', tags, setTags, 'he')} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="field-tips" className={fieldHighlightClass('tips')}>
              <label className={labelClass}>{tx.tipsHebrewOnePerLine}</label>
              <textarea {...fieldBindings('tips', tips, setTips, 'tipsEn', tipsEn, setTipsEn, 'en')} rows={2} className={inputClass} dir="rtl" />
            </div>
            <div id="field-tipsEn" className={fieldHighlightClass('tipsEn')}>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>{tx.tipsEnglishOnePerLine}</label>
                <RegenerateButton lang={lang} busy={regenerating.has('tips')} onClick={() => regenerateTranslation('tips', tips, tipsEn, setTips, setTipsEn)} />
              </div>
              <textarea {...fieldBindings('tipsEn', tipsEn, setTipsEn, 'tips', tips, setTips, 'he')} rows={2} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Ingredients */}
        <div id="field-ingredients" className={`card p-5 space-y-4 ${fieldHighlightClass('ingredients')}`}>
          <h2 className="font-serif text-lg font-bold text-cream">{tx.ingredients}</h2>
          <DndContext sensors={sensors} onDragEnd={reorderIngredientGroups}>
            <SortableContext items={ingredientGroups.map(g => g._key)} strategy={verticalListSortingStrategy}>
              {ingredientGroups.map((group, gi) => (
                <SortableRow key={group._key} id={group._key} className="border border-tint/10 rounded-xl p-4 space-y-3">
                  {({ attributes, listeners }) => (
                    <>
                      <div className="flex items-start gap-2">
                        <DragHandle attributes={attributes} listeners={listeners} className="mt-2.5" />
                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              {...fieldBindings(`ing-group-${group._key}`, group.group ?? '', v => updateIngredientGroup(gi, { group: v }), `ing-groupEn-${group._key}`, group.groupEn ?? '', v => updateIngredientGroup(gi, { groupEn: v }), 'en')}
                              placeholder={tx.groupNameHebrewOptional}
                              className={inputClass}
                              dir="rtl"
                            />
                            <input
                              {...fieldBindings(`ing-groupEn-${group._key}`, group.groupEn ?? '', v => updateIngredientGroup(gi, { groupEn: v }), `ing-group-${group._key}`, group.group ?? '', v => updateIngredientGroup(gi, { group: v }), 'he')}
                              placeholder={tx.groupNameEnglishOptional}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <RegenerateButton
                              lang={lang}
                              busy={regenerating.has(`ing-group-${group._key}`)}
                              onClick={() => regenerateTranslation(`ing-group-${group._key}`, group.group ?? '', group.groupEn ?? '', v => updateIngredientGroup(gi, { group: v }), v => updateIngredientGroup(gi, { groupEn: v }))}
                            />
                            {ingredientGroups.length > 1 && (
                              <button type="button" onClick={() => removeIngredientGroup(gi)} className="text-xs text-red-400/70 hover:text-red-400 shrink-0">
                                {tx.removeGroup}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <DndContext sensors={sensors} onDragEnd={event => reorderIngredientItems(gi, event)}>
                        <SortableContext items={group.items.map(item => item._key)} strategy={verticalListSortingStrategy}>
                          {group.items.map((item, ii) => (
                            <SortableRow key={item._key} id={item._key}>
                              {({ attributes: itemAttrs, listeners: itemListeners }) => (
                                <div id={`field-ingredients.${gi}.${ii}`} className={`flex items-start gap-2 ${fieldHighlightClass(`ingredients.${gi}.${ii}`)}`}>
                                  <DragHandle attributes={itemAttrs} listeners={itemListeners} className="mt-2.5" />
                                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                                    <div className="flex gap-2">
                                      <input type="number" step="any" value={item.amount ?? ''} onChange={e => updateIngredientItem(gi, ii, { amount: Number(e.target.value) })} className={`${inputClass} !w-16 shrink-0`} placeholder={tx.qty2} />
                                      <input value={item.unit ?? ''} onChange={e => updateIngredientItem(gi, ii, { unit: e.target.value })} className={`${inputClass} !w-16 shrink-0`} placeholder={tx.unit} />
                                      {!item.linkedRecipeId && (
                                        <button type="button" onClick={() => setLinkPickerFor({ gi, ii })} title={tx.linkToRecipe} className="shrink-0 text-cream/30 hover:text-amber text-xs px-1">
                                          🔗
                                        </button>
                                      )}
                                      <button type="button" onClick={() => removeIngredientItem(gi, ii)} className="shrink-0 text-red-400/60 hover:text-red-400 text-xs px-1">✕</button>
                                    </div>
                                    {item.linkedRecipeId ? (
                                      <LinkedIngredientDisplay
                                        recipeId={item.linkedRecipeId}
                                        onUnlink={() => updateIngredientItem(gi, ii, { linkedRecipeId: undefined })}
                                      />
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input {...fieldBindings(`ing-${item._key}`, item.name, v => updateIngredientItem(gi, ii, { name: v }), `ingEn-${item._key}`, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { nameEn: v }), 'en')} className={inputClass} placeholder={tx.nameHebrew} dir="rtl" />
                                        <input {...fieldBindings(`ingEn-${item._key}`, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { nameEn: v }), `ing-${item._key}`, item.name, v => updateIngredientItem(gi, ii, { name: v }), 'he')} className={inputClass} placeholder={tx.nameEnglish} />
                                      </div>
                                    )}
                                  </div>
                                  {!item.linkedRecipeId && (
                                    <RegenerateButton
                                      lang={lang}
                                      busy={regenerating.has(`ing-${item._key}`)}
                                      onClick={() => regenerateTranslation(`ing-${item._key}`, item.name, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { name: v }), v => updateIngredientItem(gi, ii, { nameEn: v }))}
                                    />
                                  )}
                                </div>
                              )}
                            </SortableRow>
                          ))}
                        </SortableContext>
                      </DndContext>
                      <button type="button" onClick={() => addIngredientItem(gi)} className="text-xs text-amber hover:text-amber/80">
                        + {tx.addIngredient}
                      </button>
                    </>
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" onClick={addIngredientGroup} className="btn-ghost text-xs">
            + {tx.addIngredientGroup}
          </button>
        </div>

        {linkPickerFor && (
          <RecipeLinkPicker
            excludeId={existing?.id}
            onSelect={recipe => {
              updateIngredientItem(linkPickerFor.gi, linkPickerFor.ii, { linkedRecipeId: recipe.id, name: '', nameEn: '' })
              setLinkPickerFor(null)
            }}
            onClose={() => setLinkPickerFor(null)}
          />
        )}

        {/* Steps */}
        <div id="field-steps" className={`card p-5 space-y-4 ${fieldHighlightClass('steps')}`}>
          <h2 className="font-serif text-lg font-bold text-cream">{tx.instructions}</h2>
          <DndContext sensors={sensors} onDragEnd={reorderStepGroups}>
            <SortableContext items={stepGroups.map(g => g._key)} strategy={verticalListSortingStrategy}>
              {stepGroups.map((group, gi) => (
                <SortableRow key={group._key} id={group._key} className="border border-tint/10 rounded-xl p-4 space-y-3">
                  {({ attributes, listeners }) => (
                    <>
                      <div className="flex items-start gap-2">
                        <DragHandle attributes={attributes} listeners={listeners} className="mt-2.5" />
                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              {...fieldBindings(`step-group-${group._key}`, group.title ?? '', v => updateStepGroup(gi, { title: v }), `step-groupEn-${group._key}`, group.titleEn ?? '', v => updateStepGroup(gi, { titleEn: v }), 'en')}
                              placeholder={tx.sectionTitleHebrewOptional}
                              className={inputClass}
                              dir="rtl"
                            />
                            <input
                              {...fieldBindings(`step-groupEn-${group._key}`, group.titleEn ?? '', v => updateStepGroup(gi, { titleEn: v }), `step-group-${group._key}`, group.title ?? '', v => updateStepGroup(gi, { title: v }), 'he')}
                              placeholder={tx.sectionTitleEnglishOptional}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <RegenerateButton
                              lang={lang}
                              busy={regenerating.has(`step-group-${group._key}`)}
                              onClick={() => regenerateTranslation(`step-group-${group._key}`, group.title ?? '', group.titleEn ?? '', v => updateStepGroup(gi, { title: v }), v => updateStepGroup(gi, { titleEn: v }))}
                            />
                            {stepGroups.length > 1 && (
                              <button type="button" onClick={() => removeStepGroup(gi)} className="text-xs text-red-400/70 hover:text-red-400 shrink-0">
                                {tx.removeGroup}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <DndContext sensors={sensors} onDragEnd={event => reorderStepItems(gi, event)}>
                        <SortableContext items={group.items.map(item => item._key)} strategy={verticalListSortingStrategy}>
                          {group.items.map((step, si) => (
                            <SortableRow key={step._key} id={step._key} className="border-t border-tint/[0.06] pt-3 first:border-t-0 first:pt-0">
                              {({ attributes: itemAttrs, listeners: itemListeners }) => (
                                <div id={`field-steps.${gi}.${si}`} className={`flex gap-2 ${fieldHighlightClass(`steps.${gi}.${si}`)}`}>
                                  <DragHandle attributes={itemAttrs} listeners={itemListeners} className="mt-2" />
                                  <EditableImageField
                                    image={step.image}
                                    onChange={url => { commitHistory(); updateStepItem(gi, si, { image: url }) }}
                                    uploadRecipeId={uploadRecipeIdRef.current}
                                    lang={lang}
                                    size="small"
                                  />
                                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <textarea
                                        {...fieldBindings(`step-${step._key}`, step.instruction, v => updateStepItem(gi, si, { instruction: v }), `stepEn-${step._key}`, step.instructionEn ?? '', v => updateStepItem(gi, si, { instructionEn: v }), 'en')}
                                        placeholder={lang === 'he' ? `שלב ${si + 1} (עברית)` : `Step ${si + 1} (Hebrew)`}
                                        rows={2}
                                        className={inputClass}
                                        dir="rtl"
                                      />
                                      <textarea
                                        {...fieldBindings(`stepEn-${step._key}`, step.instructionEn ?? '', v => updateStepItem(gi, si, { instructionEn: v }), `step-${step._key}`, step.instruction, v => updateStepItem(gi, si, { instruction: v }), 'he')}
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
                                      <button type="button" onClick={() => removeStepItem(gi, si)} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">✕ {tx.removeStep}</button>
                                    </div>
                                    <div className="flex gap-2">
                                      <input
                                        type="number"
                                        min={1}
                                        value={step.timerMinutes ?? ''}
                                        onChange={e => updateStepItem(gi, si, { timerMinutes: e.target.value ? Number(e.target.value) : undefined })}
                                        placeholder={tx.timerMin}
                                        className={`${inputClass} !w-32 shrink-0`}
                                      />
                                      <input
                                        value={step.tip ?? ''}
                                        onChange={e => updateStepItem(gi, si, { tip: e.target.value })}
                                        placeholder={tx.tipOptional}
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
                        + {tx.addStep}
                      </button>
                    </>
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </DndContext>
          <button type="button" onClick={addStepGroup} className="btn-ghost text-xs">
            + {tx.addStepGroup}
          </button>
        </div>

        {/* Sources - read-only once AI-generated, otherwise a normal editable field */}
        <div id="field-sources" className={`card p-5 space-y-3 ${fieldHighlightClass('sources')}`}>
          <h2 className="font-serif text-lg font-bold text-cream">{tx.sources}</h2>
          {aiGenerated ? (
            <ul className="space-y-1.5">
              {sources.map(s => (
                <li key={s.url} className="text-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-amber hover:text-amber/80 underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {sources.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={s.title}
                    onChange={e => setSources(prev => prev.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x))}
                    placeholder={tx.sourceTitle}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    value={s.url}
                    onChange={e => setSources(prev => prev.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x))}
                    placeholder="https://..."
                    className={`${inputClass} flex-1`}
                  />
                  <button type="button" onClick={() => setSources(prev => prev.filter((_, xi) => xi !== i))} className="text-cream/30 hover:text-red-400 shrink-0">
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setSources(prev => [...prev, { title: '', url: '' }])} className="text-xs text-amber hover:text-amber/80">
                + {tx.addSource}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
            {saving
              ? (tx.saving)
              : isEditing ? (tx.saveChanges) : (tx.createRecipe)}
          </button>
          <button type="button" onClick={() => history.canUndo ? setExitConfirmOpen(true) : navigate(-1)} className="btn-ghost">
            {tx.cancel}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={exitConfirmOpen}
        title={tx.discardUnsavedChanges}
        message={tx.youHaveUnsavedChangesLeavingNow}
        confirmLabel={tx.discard}
        cancelLabel={tx.keepEditing}
        danger
        onConfirm={() => { setExitConfirmOpen(false); navigate(-1) }}
        onCancel={() => setExitConfirmOpen(false)}
      />
    </div>
  )
}
