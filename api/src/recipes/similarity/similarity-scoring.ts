export interface SimilarityIngredientItem {
  name?: string
  unit?: string
  amount?: number
}

export interface SimilarityIngredientGroup {
  items: SimilarityIngredientItem[]
}

export interface SimilarityTitleFields {
  title?: string
  titleHe?: string
}

export const INGREDIENT_QUANTITY_THRESHOLD = 0.95
export const INGREDIENT_NAME_THRESHOLD = 0.85
export const TITLE_THRESHOLD = 0.8

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function flattenIngredients(groups: SimilarityIngredientGroup[] | undefined): SimilarityIngredientItem[] {
  return (groups ?? []).flatMap(g => g.items ?? [])
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const key of a) {
    if (b.has(key)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// Requires name+unit+amount to match exactly for two ingredients to count
// as "the same" - this is the tightest tier (95%+ threshold), meant to
// catch a recipe that's essentially copy-pasted with the same measurements.
export function ingredientQuantityScore(
  a: SimilarityIngredientGroup[] | undefined,
  b: SimilarityIngredientGroup[] | undefined,
): number {
  const setA = new Set(flattenIngredients(a).map(i => `${normalizeText(i.name)}|${normalizeText(i.unit)}|${i.amount ?? ''}`))
  const setB = new Set(flattenIngredients(b).map(i => `${normalizeText(i.name)}|${normalizeText(i.unit)}|${i.amount ?? ''}`))
  return jaccard(setA, setB)
}

// Ignores unit/amount - two recipes using the same ingredient list at
// different quantities (e.g. a rescaled copy) still score high here even
// though ingredientQuantityScore would not consider them a match.
export function ingredientNameScore(
  a: SimilarityIngredientGroup[] | undefined,
  b: SimilarityIngredientGroup[] | undefined,
): number {
  const setA = new Set(flattenIngredients(a).map(i => normalizeText(i.name)).filter(Boolean))
  const setB = new Set(flattenIngredients(b).map(i => normalizeText(i.name)).filter(Boolean))
  return jaccard(setA, setB)
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function titleRatio(a: string, b: string): number {
  if (!a && !b) return 0
  const distance = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 0 : 1 - distance / maxLen
}

// Takes the best of the English and Hebrew title comparisons - a recipe
// resubmitted with only its Hebrew title translated (or vice versa) should
// still be caught even if the other language field is missing on one side.
export function titleSimilarityScore(a: SimilarityTitleFields, b: SimilarityTitleFields): number {
  const enScore = titleRatio(normalizeText(a.title), normalizeText(b.title))
  const heScore = a.titleHe && b.titleHe ? titleRatio(normalizeText(a.titleHe), normalizeText(b.titleHe)) : 0
  return Math.max(enScore, heScore)
}

export function isDuplicateCandidate(
  a: SimilarityTitleFields & { ingredients?: SimilarityIngredientGroup[] },
  b: SimilarityTitleFields & { ingredients?: SimilarityIngredientGroup[] },
): boolean {
  return (
    ingredientQuantityScore(a.ingredients, b.ingredients) >= INGREDIENT_QUANTITY_THRESHOLD ||
    ingredientNameScore(a.ingredients, b.ingredients) >= INGREDIENT_NAME_THRESHOLD ||
    titleSimilarityScore(a, b) >= TITLE_THRESHOLD
  )
}
