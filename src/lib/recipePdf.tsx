import QRCode from 'qrcode'
import { formatTime, scaleAmount } from '../utils/format'
import { resizedImage } from './image'
import { t, heUnit } from '../i18n'
import type { Recipe, Lang } from '../types'

export interface PdfIngredientItem {
  amountText: string | null
  unitText: string | null
  nameText: string
  noteText?: string
}

export interface PdfIngredientGroup {
  label?: string
  items: PdfIngredientItem[]
}

export interface PdfStepItem {
  text: string
}

export interface PdfStepGroup {
  title?: string
  items: PdfStepItem[]
}

export interface PdfRecipeData {
  title: string
  tag: string
  imageUrl?: string
  prepTimeText: string
  cookTimeText: string
  totalTimeText: string
  servingsText: string
  difficultyText: string
  ingredientsHeading: string
  methodHeading: string
  tipsHeading: string
  ingredients: PdfIngredientGroup[]
  steps: PdfStepGroup[]
  tips?: string[]
  isRtl: boolean
  qrDataUrl: string
  brandName: string
}

function buildPdfRecipeData(recipe: Recipe, lang: Lang, multiplier: number, qrDataUrl: string): PdfRecipeData {
  const tx = t[lang]
  const isRtl = lang === 'he'
  const title = isRtl ? (recipe.titleHe || recipe.title) : recipe.title
  const tagParts = [recipe.cuisine, tx.categories[recipe.category]].filter((v): v is string => !!v)

  const ingredients: PdfIngredientGroup[] = recipe.ingredients.map(group => ({
    label: (isRtl ? (group.group || group.groupEn) : (group.groupEn || group.group)) || undefined,
    items: group.items.map(item => {
      const scaledAmount = item.amount ? item.amount * multiplier : 0
      const unit = isRtl ? heUnit(item.unit, scaledAmount) : item.unit
      return {
        amountText: item.amount ? scaleAmount(item.amount, multiplier) : null,
        unitText: unit || null,
        nameText: isRtl ? item.name : (item.nameEn ?? item.name),
        noteText: (isRtl ? item.note : (item.noteEn ?? item.note)) || undefined,
      }
    }),
  }))

  const steps: PdfStepGroup[] = recipe.steps.map(group => ({
    title: (isRtl ? (group.title || group.titleEn) : (group.titleEn || group.title)) || undefined,
    items: group.items.map(step => ({
      text: isRtl ? step.instruction : (step.instructionEn ?? step.instruction),
    })),
  }))

  const tips = isRtl ? recipe.tips : (recipe.tipsEn ?? recipe.tips)

  return {
    title,
    tag: tagParts.join(' · '),
    imageUrl: resizedImage(recipe.image, 1200),
    prepTimeText: `${tx.prep} ${formatTime(recipe.prepTime)}`,
    cookTimeText: `${tx.cook} ${formatTime(recipe.cookTime)}`,
    totalTimeText: `${tx.total} ${formatTime(recipe.prepTime + recipe.cookTime)}`,
    servingsText: `${Math.round(recipe.servings * multiplier)} ${tx.servings}`,
    difficultyText: tx.difficulty[recipe.difficulty],
    ingredientsHeading: tx.ingredients2,
    methodHeading: tx.instructions2,
    tipsHeading: tx.tipsTitle,
    ingredients,
    steps,
    tips: tips && tips.length > 0 ? tips : undefined,
    isRtl,
    qrDataUrl,
    brandName: tx.siteTitle,
  }
}

export async function downloadRecipePdf(recipe: Recipe, lang: Lang, multiplier: number): Promise<void> {
  // Dynamically imported so @react-pdf/renderer (and RecipePdfDocument's font
  // registrations) only load when a user actually requests a PDF, instead of
  // bloating the main entry bundle on every route. The caller already wraps
  // this call in a `pdfGenerating` loading state, so the extra async delay
  // from fetching these chunks is already covered.
  const [{ pdf }, { default: RecipePdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/pdf/RecipePdfDocument'),
  ])
  const shareUrl = `${window.location.origin}/share/recipes/${recipe.id}`
  const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 128 })
  const data = buildPdfRecipeData(recipe, lang, multiplier, qrDataUrl)
  const blob = await pdf(<RecipePdfDocument data={data} />).toBlob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const fileSafeTitle = data.title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'recipe'
  link.download = `${fileSafeTitle}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
