import {
  ingredientQuantityScore,
  ingredientNameScore,
  titleSimilarityScore,
  isDuplicateCandidate,
  INGREDIENT_QUANTITY_THRESHOLD,
  INGREDIENT_NAME_THRESHOLD,
  TITLE_THRESHOLD,
} from './similarity-scoring'

describe('ingredientQuantityScore', () => {
  it('scores 1 when ingredient name+unit+amount sets are identical', () => {
    const a = [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }, { name: 'Flour', unit: 'g', amount: 300 }] }]
    const b = [{ items: [{ name: 'sugar', unit: 'G', amount: 200 }, { name: ' Flour ', unit: 'g', amount: 300 }] }]
    expect(ingredientQuantityScore(a, b)).toBe(1)
  })

  it('scores partial overlap as a Jaccard ratio', () => {
    const a = [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }, { name: 'Flour', unit: 'g', amount: 300 }] }]
    const b = [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }, { name: 'Butter', unit: 'g', amount: 100 }] }]
    // intersection = 1 (Sugar|g|200), union = 2 + 2 - 1 = 3
    expect(ingredientQuantityScore(a, b)).toBeCloseTo(1 / 3, 5)
  })

  it('scores 0 for completely disjoint ingredients', () => {
    const a = [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }] }]
    const b = [{ items: [{ name: 'Salt', unit: 'g', amount: 5 }] }]
    expect(ingredientQuantityScore(a, b)).toBe(0)
  })

  it('scores 0 when both sides have no ingredients', () => {
    expect(ingredientQuantityScore(undefined, undefined)).toBe(0)
    expect(ingredientQuantityScore([], [])).toBe(0)
  })

  it('does not match same name+unit with a different amount', () => {
    const a = [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }] }]
    const b = [{ items: [{ name: 'Sugar', unit: 'g', amount: 100 }] }]
    expect(ingredientQuantityScore(a, b)).toBe(0)
  })
})

describe('ingredientNameScore', () => {
  it('scores 1 when names match even if unit/amount differ (e.g. scaled recipe)', () => {
    const a = [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }, { name: 'Flour', unit: 'g', amount: 300 }] }]
    const b = [{ items: [{ name: 'Sugar', unit: 'cup', amount: 1 }, { name: 'Flour', unit: 'cup', amount: 2 }] }]
    expect(ingredientNameScore(a, b)).toBe(1)
  })

  it('ignores blank/missing names', () => {
    const a = [{ items: [{ name: '', unit: 'g', amount: 1 }, { name: 'Sugar' }] }]
    const b = [{ items: [{ name: 'Sugar' }] }]
    expect(ingredientNameScore(a, b)).toBe(1)
  })
})

describe('titleSimilarityScore', () => {
  it('scores 1 for identical titles regardless of case', () => {
    expect(titleSimilarityScore({ title: 'Chocolate Chip Cookies' }, { title: 'chocolate chip cookies' })).toBe(1)
  })

  it('scores high for a near-identical title (one character off)', () => {
    const score = titleSimilarityScore({ title: 'Chocolate Chip Cookies' }, { title: 'Chocolate Chip Cookie' })
    expect(score).toBeGreaterThanOrEqual(TITLE_THRESHOLD)
    expect(score).toBeLessThan(1)
  })

  it('scores low for unrelated titles', () => {
    const score = titleSimilarityScore({ title: 'Chocolate Chip Cookies' }, { title: 'Banana Bread' })
    expect(score).toBeLessThan(TITLE_THRESHOLD)
  })

  it('takes the best of English/Hebrew comparisons when both sides have a Hebrew title', () => {
    const a = { title: 'Totally Different English', titleHe: 'עוגיות שוקולד' }
    const b = { title: 'Something Else Entirely', titleHe: 'עוגיות שוקולד' }
    expect(titleSimilarityScore(a, b)).toBe(1)
  })

  it('ignores the Hebrew side when only one recipe has a Hebrew title', () => {
    const a = { title: 'Chocolate Chip Cookies', titleHe: 'עוגיות שוקולד' }
    const b = { title: 'Chocolate Chip Cookies' }
    expect(titleSimilarityScore(a, b)).toBe(1)
  })
})

describe('isDuplicateCandidate', () => {
  it('is true when the ingredient+quantity tier crosses its threshold, even with a different title', () => {
    const a = { title: "Grandma's Soup", ingredients: [{ items: [{ name: 'Carrot', unit: 'g', amount: 100 }] }] }
    const b = { title: 'Totally Different Name', ingredients: [{ items: [{ name: 'Carrot', unit: 'g', amount: 100 }] }] }
    expect(ingredientQuantityScore(a.ingredients, b.ingredients)).toBeGreaterThanOrEqual(INGREDIENT_QUANTITY_THRESHOLD)
    expect(isDuplicateCandidate(a, b)).toBe(true)
  })

  it('is true when the title tier crosses its threshold, even with different ingredients', () => {
    const a = { title: 'Chocolate Chip Cookies', ingredients: [{ items: [{ name: 'Flour', unit: 'g', amount: 300 }] }] }
    const b = { title: 'Chocolate Chip Cookie', ingredients: [{ items: [{ name: 'Sugar', unit: 'g', amount: 200 }] }] }
    expect(isDuplicateCandidate(a, b)).toBe(true)
  })

  it('is false when neither tier crosses its threshold', () => {
    const a = { title: 'Chocolate Chip Cookies', ingredients: [{ items: [{ name: 'Flour', unit: 'g', amount: 300 }] }] }
    const b = { title: 'Banana Bread', ingredients: [{ items: [{ name: 'Banana', unit: 'g', amount: 200 }] }] }
    expect(ingredientNameScore(a.ingredients, b.ingredients)).toBeLessThan(INGREDIENT_NAME_THRESHOLD)
    expect(isDuplicateCandidate(a, b)).toBe(false)
  })
})
