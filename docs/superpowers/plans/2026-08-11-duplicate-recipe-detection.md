# Duplicate Recipe Detection + Dispute Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block a recipe from publishing when it's judged a near-duplicate of an existing recipe (by a local heuristic candidate search + a Gemini AI judge), and let the owner dispute the block to the app owner (admin).

**Architecture:** A new `RecipeSimilarityService` runs a cheap local Jaccard/Levenshtein heuristic across three tiers (ingredient+quantity ≥95%, ingredient-name-only ≥85%, title ≥80%) to shortlist candidate recipes with zero AI cost when nothing's close. Only when candidates exist does it call Gemini (reusing the existing `GeminiService`, same pattern as `RecipeQualityService`) to judge whether the new recipe is truly a duplicate. `RecipesService.submitForReview` runs this check before the existing quality review; a duplicate verdict sets `status: 'rejected'` with a new `duplicateReview` field and skips the quality review entirely. The recipe owner can dispute via a new endpoint; the app owner (the existing single-admin `OWNER_USER_ID` concept, already used by `FeatureRequestsController`) approves or denies from a new admin panel.

**Tech Stack:** NestJS (`api/`), Mongoose, `@google/genai` via the existing `GeminiService`, React/Vite (`src/`), Jest for both.

## Global Constraints

- Ingredient+quantity match tier threshold: **≥ 0.95** (Jaccard on normalized name+unit+amount).
- Ingredient-name-only match tier threshold: **≥ 0.85** (Jaccard on normalized name).
- Title similarity tier threshold: **≥ 0.80** (Levenshtein-ratio, best of English/Hebrew title pair).
- A recipe is a **candidate** if it crosses *any* one of the three thresholds against the submission being checked.
- The Gemini judge call only fires when at least one candidate exists — never spend an AI call on a submission with zero heuristic matches.
- A duplicate verdict is a **hard block** (`status: 'rejected'`), disputable by the recipe's owner; a non-duplicate verdict (or zero candidates) proceeds straight to the existing, unchanged quality-review flow.
- Admin identity is `userId === OWNER_USER_ID` (`src/lib/admin.ts` on the frontend, `config.get('OWNER_USER_ID')` on the backend) — the same check already used throughout the codebase (`FeatureRequestsController`, `RecipesController.isAdmin`). No new roles/permissions system.
- No new npm dependencies — Levenshtein distance and Jaccard similarity are implemented directly (both are ~15 lines of plain TypeScript).
- Follow `CLAUDE.md`'s activity-logging convention: every new mutating action gets an `ActivityLogService.record(...)` call at the controller layer, named `<noun>_<verb_past_tense>`.

---

### Task 1: Similarity scoring — pure functions

**Files:**
- Create: `api/src/recipes/similarity/similarity-scoring.ts`
- Test: `api/src/recipes/similarity/similarity-scoring.spec.ts`

**Interfaces:**
- Produces (used by Task 2): `ingredientQuantityScore(a, b): number`, `ingredientNameScore(a, b): number`, `titleSimilarityScore(a, b): number`, `isDuplicateCandidate(a, b): boolean`, plus exported constants `INGREDIENT_QUANTITY_THRESHOLD = 0.95`, `INGREDIENT_NAME_THRESHOLD = 0.85`, `TITLE_THRESHOLD = 0.8`, and types `SimilarityIngredientItem`, `SimilarityIngredientGroup`, `SimilarityTitleFields`.

- [ ] **Step 1: Write the failing test**

Create `api/src/recipes/similarity/similarity-scoring.spec.ts`:

```typescript
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
    const a = { title: 'Grandma’s Soup', ingredients: [{ items: [{ name: 'Carrot', unit: 'g', amount: 100 }] }] }
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest src/recipes/similarity/similarity-scoring.spec.ts`
Expected: FAIL with "Cannot find module './similarity-scoring'"

- [ ] **Step 3: Write the implementation**

Create `api/src/recipes/similarity/similarity-scoring.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx jest src/recipes/similarity/similarity-scoring.spec.ts`
Expected: PASS, all 14 tests green

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/similarity/similarity-scoring.ts api/src/recipes/similarity/similarity-scoring.spec.ts
git commit -m "feat: add duplicate-recipe similarity scoring functions"
```

---

### Task 2: RecipeSimilarityService (candidate search + AI judge)

**Files:**
- Modify: `api/src/ai/gemini.service.ts` (add optional `temperature` param to `generateStructured`)
- Create: `api/src/recipes/similarity/recipe-similarity.service.ts`
- Test: `api/src/recipes/similarity/recipe-similarity.service.spec.ts`
- Modify: `api/src/recipes/recipes.module.ts` (register the new provider)

**Interfaces:**
- Consumes: `ingredientQuantityScore`, `ingredientNameScore`, `titleSimilarityScore`, `isDuplicateCandidate` from Task 1's `./similarity-scoring`. `GeminiService.generateStructured<T>(prompt: string, temperature?: number): Promise<T>`.
- Produces (used by Task 3): `RecipeSimilarityService.findCandidates(recipe: SimilaritySourceRecipe, excludeId: string): Promise<SimilarityCandidate[]>` and `RecipeSimilarityService.judge(recipe: SimilaritySourceRecipe, candidates: SimilarityCandidate[]): Promise<DuplicateVerdict>`, where:
  ```typescript
  interface SimilaritySourceRecipe {
    title?: string
    titleHe?: string
    ingredients?: { items: { name?: string; unit?: string; amount?: number }[] }[]
    steps?: unknown
    ownerId?: string
  }
  interface SimilarityCandidate {
    id: string
    title: string
    titleHe?: string
    ingredients: { items: { name?: string; unit?: string; amount?: number }[] }[]
    steps: unknown
  }
  interface DuplicateVerdict {
    isDuplicate: boolean
    matchedRecipeId?: string
    reason: string
  }
  ```

- [ ] **Step 1: Add the optional temperature parameter to `GeminiService.generateStructured`**

In `api/src/ai/gemini.service.ts`, replace the existing `generateStructured` method:

```typescript
  async generateStructured<T>(prompt: string): Promise<T> {
    const client = this.getClient()
    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    })
    if (!response.text) throw new Error('Gemini returned an empty response')
    return JSON.parse(response.text) as T
  }
```

with:

```typescript
  async generateStructured<T>(prompt: string, temperature?: number): Promise<T> {
    const client = this.getClient()
    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json', ...(temperature !== undefined ? { temperature } : {}) },
    })
    if (!response.text) throw new Error('Gemini returned an empty response')
    return JSON.parse(response.text) as T
  }
```

This is backward compatible - every existing caller passes only one argument, so behavior for them is unchanged.

- [ ] **Step 2: Write the failing test for RecipeSimilarityService**

Create `api/src/recipes/similarity/recipe-similarity.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipeSimilarityService } from './recipe-similarity.service'
import { Recipe } from '../schemas/recipe.schema'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeSimilarityService', () => {
  const generateStructured = jest.fn()
  const gemini = { generateStructured }

  function makeOther(overrides: Record<string, unknown> = {}) {
    return {
      _id: { toString: () => 'other-id' },
      title: 'Something Else',
      titleHe: undefined,
      ingredients: [{ items: [{ name: 'Nothing Shared', unit: 'g', amount: 1 }] }],
      steps: [],
      ...overrides,
    }
  }

  async function makeService(others: Record<string, unknown>[]) {
    const exec = jest.fn().mockResolvedValue(others)
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ select })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeSimilarityService,
        { provide: getModelToken(Recipe.name), useValue: { find } },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile()
    return { service: moduleRef.get(RecipeSimilarityService), find }
  }

  beforeEach(() => jest.clearAllMocks())

  const newRecipe = {
    title: 'Chocolate Chip Cookies',
    titleHe: undefined,
    ownerId: 'user_1',
    ingredients: [{ items: [{ name: 'Flour', unit: 'g', amount: 300 }, { name: 'Sugar', unit: 'g', amount: 200 }] }],
    steps: [{ items: [{ instruction: 'Mix and bake' }] }],
  }

  it('queries recipes owned by the submitter or ever-published, excluding the submission itself', async () => {
    const { service, find } = await makeService([])
    await service.findCandidates(newRecipe, 'self-id')

    expect(find).toHaveBeenCalledWith({
      _id: { $ne: 'self-id' },
      deletedAt: { $exists: false },
      $or: [{ ownerId: 'user_1' }, { publishedRevision: { $ne: null }, hidden: { $ne: true } }],
    })
  })

  it('excludes recipes that cross none of the similarity thresholds', async () => {
    const { service } = await makeService([makeOther()])
    const candidates = await service.findCandidates(newRecipe, 'self-id')
    expect(candidates).toEqual([])
  })

  it('includes a recipe whose title crosses the title threshold, mapped to the candidate shape', async () => {
    const other = makeOther({ _id: { toString: () => 'twin-id' }, title: 'Chocolate Chip Cookie' })
    const { service } = await makeService([other])
    const candidates = await service.findCandidates(newRecipe, 'self-id')
    expect(candidates).toEqual([{ id: 'twin-id', title: 'Chocolate Chip Cookie', titleHe: undefined, ingredients: other.ingredients, steps: other.steps }])
  })

  it('sorts candidates by best matching score, highest first, and caps at 5', async () => {
    const strongMatch = makeOther({ _id: { toString: () => 'strong' }, title: 'Chocolate Chip Cookies' }) // title score 1
    const weakMatches = Array.from({ length: 5 }, (_, i) => makeOther({
      _id: { toString: () => `weak-${i}` },
      title: 'Chocolate Chip Cookie', // slightly lower title score than an exact match
    }))
    const { service } = await makeService([...weakMatches, strongMatch])
    const candidates = await service.findCandidates(newRecipe, 'self-id')
    expect(candidates).toHaveLength(5)
    expect(candidates[0].id).toBe('strong')
  })

  it('judge sends the new recipe and candidates to Gemini at temperature 0 and returns its verdict', async () => {
    generateStructured.mockResolvedValue({ isDuplicate: true, matchedRecipeId: 'twin-id', reason: 'same dish, rescaled' })
    const { service } = await makeService([])
    const candidates = [{ id: 'twin-id', title: 'Chocolate Chip Cookie', titleHe: undefined, ingredients: [], steps: [] }]

    const verdict = await service.judge(newRecipe, candidates)

    expect(verdict).toEqual({ isDuplicate: true, matchedRecipeId: 'twin-id', reason: 'same dish, rescaled' })
    expect(generateStructured).toHaveBeenCalledTimes(1)
    const [prompt, temperature] = generateStructured.mock.calls[0]
    expect(temperature).toBe(0)
    expect(prompt).toContain('Chocolate Chip Cookies')
    expect(prompt).toContain('twin-id')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npx jest src/recipes/similarity/recipe-similarity.service.spec.ts`
Expected: FAIL with "Cannot find module './recipe-similarity.service'"

- [ ] **Step 4: Write the implementation**

Create `api/src/recipes/similarity/recipe-similarity.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from '../schemas/recipe.schema'
import { GeminiService } from '../../ai/gemini.service'
import { ingredientQuantityScore, ingredientNameScore, titleSimilarityScore, isDuplicateCandidate } from './similarity-scoring'

const MAX_CANDIDATES = 5

export interface SimilarityIngredientGroup {
  items: { name?: string; unit?: string; amount?: number }[]
}

export interface SimilaritySourceRecipe {
  title?: string
  titleHe?: string
  ingredients?: SimilarityIngredientGroup[]
  steps?: unknown
  ownerId?: string
}

export interface SimilarityCandidate {
  id: string
  title: string
  titleHe?: string
  ingredients: SimilarityIngredientGroup[]
  steps: unknown
}

export interface DuplicateVerdict {
  isDuplicate: boolean
  matchedRecipeId?: string
  reason: string
}

interface CandidateDoc {
  _id: { toString(): string }
  title: string
  titleHe?: string
  ingredients: SimilarityIngredientGroup[]
  steps: unknown
}

const DUPLICATE_JUDGE_PROMPT = `You are checking whether a newly submitted recipe on a recipe-sharing app is a duplicate of an already-existing recipe.

"Duplicate" means the same dish, not meaningfully differentiated - e.g. the same recipe reworded, rescaled, or with trivial ingredient substitutions. Two different recipes that happen to be the same general category of dish (e.g. two genuinely different chocolate-chip-cookie recipes with different techniques or ratios) are NOT duplicates - only flag a true near-copy.

Return ONLY JSON matching this shape:
{"isDuplicate": boolean, "matchedRecipeId": string (required and must be one of the candidates' "id" values if isDuplicate is true, omit otherwise), "reason": string explaining your decision}`

@Injectable()
export class RecipeSimilarityService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly gemini: GeminiService,
  ) {}

  async findCandidates(recipe: SimilaritySourceRecipe, excludeId: string): Promise<SimilarityCandidate[]> {
    const others = await this.recipeModel
      .find({
        _id: { $ne: excludeId },
        deletedAt: { $exists: false },
        $or: [{ ownerId: recipe.ownerId }, { publishedRevision: { $ne: null }, hidden: { $ne: true } }],
      })
      .select('title titleHe ingredients steps')
      .lean()
      .exec() as unknown as CandidateDoc[]

    return others
      .filter(other => isDuplicateCandidate(recipe, other))
      .sort((a, b) => this.bestScore(recipe, b) - this.bestScore(recipe, a))
      .slice(0, MAX_CANDIDATES)
      .map(other => ({ id: other._id.toString(), title: other.title, titleHe: other.titleHe, ingredients: other.ingredients, steps: other.steps }))
  }

  async judge(recipe: SimilaritySourceRecipe, candidates: SimilarityCandidate[]): Promise<DuplicateVerdict> {
    const prompt = `${DUPLICATE_JUDGE_PROMPT}

New recipe:
${JSON.stringify({ title: recipe.title, titleHe: recipe.titleHe, ingredients: recipe.ingredients, steps: recipe.steps })}

Candidate existing recipes:
${JSON.stringify(candidates)}`
    // Low temperature, same rationale as RecipeQualityService: a checklist
    // judgment should be reproducible across resubmissions, not creative.
    return this.gemini.generateStructured<DuplicateVerdict>(prompt, 0)
  }

  private bestScore(recipe: SimilaritySourceRecipe, other: CandidateDoc): number {
    return Math.max(
      ingredientQuantityScore(recipe.ingredients, other.ingredients),
      ingredientNameScore(recipe.ingredients, other.ingredients),
      titleSimilarityScore(recipe, other),
    )
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npx jest src/recipes/similarity/recipe-similarity.service.spec.ts`
Expected: PASS, all 5 tests green

- [ ] **Step 6: Register the provider in RecipesModule**

In `api/src/recipes/recipes.module.ts`, add the import:

```typescript
import { RecipeSimilarityService } from './similarity/recipe-similarity.service'
```

and add `RecipeSimilarityService` to the `providers` array (alongside the existing `RecipeQualityService`):

```typescript
  providers: [RecipesService, RecipeImportService, NutritionService, RecipeAiGenerateService, RecipeQualityService, RecipeSimilarityService],
```

- [ ] **Step 7: Run the full backend test suite to confirm nothing broke**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green (module wiring change only, no behavior change yet)

- [ ] **Step 8: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/ai/gemini.service.ts api/src/recipes/similarity/recipe-similarity.service.ts api/src/recipes/similarity/recipe-similarity.service.spec.ts api/src/recipes/recipes.module.ts
git commit -m "feat: add RecipeSimilarityService (candidate search + Gemini duplicate judge)"
```

---

### Task 3: Wire duplicate detection into submitForReview

**Files:**
- Modify: `api/src/recipes/schemas/recipe.schema.ts`
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `RecipeSimilarityService.findCandidates`/`judge` from Task 2.
- Produces (used by Task 4): `recipe.duplicateReview`, `recipe.disputeStatus`, `recipe.duplicateCheckOverride` fields on `RecipeDocument`.

- [ ] **Step 1: Add the new schema fields**

In `api/src/recipes/schemas/recipe.schema.ts`, insert the following block immediately after the existing `qualityReview` prop (after the closing `}` on the line `  }` that follows `suggestedFields?: Record<string, unknown>` and before `@Prop({ default: 0 })\n  currentRevision!: number`):

```typescript
  // Result of the local-heuristic + AI duplicate check that runs before the
  // quality review on submit. Only ever set when the AI judged this
  // submission a duplicate - overwritten (not appended) on each
  // resubmission, same "no history" tradeoff as qualityReview.
  @Prop({ type: MongooseSchema.Types.Mixed })
  duplicateReview?: {
    isDuplicate: boolean
    matchedRecipeId: string
    matchedRecipeTitle: string
    reason: string
    checkedAt: string
  }

  // Dispute lifecycle for a duplicate-blocked submission. 'none' is also the
  // resting state for a recipe that was never blocked at all.
  @Prop({ enum: ['none', 'pending', 'approved', 'denied'], default: 'none' })
  disputeStatus!: 'none' | 'pending' | 'approved' | 'denied'

  @Prop()
  disputeMessage?: string

  @Prop()
  disputeCreatedAt?: Date

  @Prop()
  disputeResolvedAt?: Date

  // Set true only when an admin approves a dispute - permanently exempts
  // this recipe document from future duplicate checks, since its content
  // was already judged a false positive and re-submitting the same content
  // shouldn't re-trigger the same block.
  @Prop({ default: false })
  duplicateCheckOverride!: boolean

```

- [ ] **Step 2: Write the failing tests for the submitForReview integration**

In `api/src/recipes/recipes.service.spec.ts`, add a `makeSimilarityService` helper next to the existing `makeQualityService` helper (around line 33):

```typescript
  function makeSimilarityService(candidates: unknown[] = [], verdict: Record<string, unknown> = { isDuplicate: false, reason: 'not a duplicate' }) {
    return { findCandidates: jest.fn().mockResolvedValue(candidates), judge: jest.fn().mockResolvedValue(verdict) }
  }
```

Add the import at the top of the file:

```typescript
import { RecipeSimilarityService } from './similarity/recipe-similarity.service'
```

Extend `makeService`'s signature and providers array to accept and wire a 10th parameter:

```typescript
  async function makeService(
    recipeModel: Record<string, unknown>,
    revisionModel: Record<string, unknown> = noRevisionFound(),
    ratingModel: Record<string, unknown> = { aggregate: jest.fn().mockResolvedValue([]) },
    activityLog = makeActivityLog(),
    cookLog = makeCookLog(),
    config: Record<string, unknown> = { get: jest.fn().mockReturnValue('owner_1') },
    usersService = makeUsers(),
    qualityService = makeQualityService(),
    similarityService = makeSimilarityService(),
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: getModelToken(RecipeRevision.name), useValue: revisionModel },
        { provide: getModelToken(Rating.name), useValue: ratingModel },
        { provide: ActivityLogService, useValue: activityLog },
        { provide: CookLogService, useValue: cookLog },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: config },
        { provide: RecipeQualityService, useValue: qualityService },
        { provide: RecipeSimilarityService, useValue: similarityService },
      ],
```

(Keep the rest of `makeService`'s body — the `.compile()` and `return` lines — unchanged.)

Add these four tests right after the existing `'submitForReview rejects when the AI review score is below the threshold'` test (around line 611, before the `'submitForReview throws BadRequestException listing missing required fields...'` test):

```typescript
  it('submitForReview does not call the duplicate judge when there are no candidates', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const similarity = makeSimilarityService([])
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(similarity.findCandidates).toHaveBeenCalledWith(recipe, 'a')
    expect(similarity.judge).not.toHaveBeenCalled()
    expect(recipe.status).toBe('published')
  })

  it('submitForReview rejects and skips the quality review when the AI judges a duplicate', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const quality = makeQualityService()
    const candidates = [{ id: 'other-1', title: 'Other Soup', titleHe: undefined, ingredients: [], steps: [] }]
    const similarity = makeSimilarityService(candidates, { isDuplicate: true, matchedRecipeId: 'other-1', reason: 'same dish, rescaled' })
    const service = await makeService({ findOne }, undefined, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    const result = await service.submitForReview('a', 'user_1', false)

    expect(quality.review).not.toHaveBeenCalled()
    expect(recipe.status).toBe('rejected')
    expect(recipe.qualityReview).toBeUndefined()
    expect(recipe.duplicateReview).toMatchObject({
      isDuplicate: true,
      matchedRecipeId: 'other-1',
      matchedRecipeTitle: 'Other Soup',
      reason: 'same dish, rescaled',
    })
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
  })

  it('submitForReview proceeds to the quality review when the AI judges no duplicate among candidates', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const candidates = [{ id: 'other-1', title: 'Other Soup', titleHe: undefined, ingredients: [], steps: [] }]
    const similarity = makeSimilarityService(candidates, { isDuplicate: false, reason: 'different dish' })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(quality.review).toHaveBeenCalled()
    expect(recipe.status).toBe('published')
  })

  it('submitForReview skips the duplicate check entirely when duplicateCheckOverride is set', async () => {
    const recipe: any = completeRecipe({ duplicateCheckOverride: true })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const similarity = makeSimilarityService()
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, similarity)

    await service.submitForReview('a', 'user_1', false)

    expect(similarity.findCandidates).not.toHaveBeenCalled()
    expect(quality.review).toHaveBeenCalled()
    expect(recipe.status).toBe('published')
  })
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `cd api && npx jest src/recipes/recipes.service.spec.ts -t "duplicate"`
Expected: FAIL — `RecipesService` constructor doesn't yet accept a `RecipeSimilarityService`, and `submitForReview` doesn't yet call it.

- [ ] **Step 4: Wire RecipeSimilarityService into RecipesService**

In `api/src/recipes/recipes.service.ts`, add the import:

```typescript
import { RecipeSimilarityService } from './similarity/recipe-similarity.service'
```

Add `similarityService` to the constructor (after the existing `qualityService` param):

```typescript
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(RecipeRevision.name) private readonly revisionModel: Model<RecipeRevisionDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
    private readonly activityLogService: ActivityLogService,
    private readonly cookLogService: CookLogService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly qualityService: RecipeQualityService,
    private readonly similarityService: RecipeSimilarityService,
  ) {}
```

Replace the body of `submitForReview` (currently lines 411-443) with:

```typescript
  async submitForReview(id: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    const missing = this.missingRequiredFields(recipe)
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot submit for review, missing/invalid: ${missing.join(', ')}`)
    }
    await this.assertLinksPublishable(id)

    await this.activityLogService.record(userId, id, 'recipe_submitted_for_review')

    if (!recipe.duplicateCheckOverride) {
      const candidates = await this.similarityService.findCandidates(recipe, id)
      if (candidates.length > 0) {
        const verdict = await this.similarityService.judge(recipe, candidates)
        await this.activityLogService.record(userId, id, 'ai_duplicate_check_used')
        if (verdict.isDuplicate && verdict.matchedRecipeId) {
          const matched = candidates.find(c => c.id === verdict.matchedRecipeId)
          recipe.status = 'rejected'
          recipe.duplicateReview = {
            isDuplicate: true,
            matchedRecipeId: verdict.matchedRecipeId,
            matchedRecipeTitle: matched?.title ?? '',
            reason: verdict.reason,
            checkedAt: new Date().toISOString(),
          }
          recipe.qualityReview = undefined
          recipe.disputeStatus = 'none'
          await recipe.save()
          await this.activityLogService.record(userId, id, 'recipe_duplicate_blocked', { matchedRecipeId: verdict.matchedRecipeId })
          return recipe
        }
      }
    }

    const review = await this.qualityService.review(recipe.toObject())
    await this.activityLogService.record(userId, id, 'ai_quality_review_used')

    if (review.score >= RecipesService.PUBLISH_THRESHOLD) {
      await this.revisionModel.updateOne(
        { recipeId: id, revisionNumber: recipe.currentRevision },
        { $set: { published: true } },
      )
      recipe.publishedRevision = recipe.currentRevision
      recipe.status = 'published'
      recipe.pendingReview = false
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_published')
    } else {
      recipe.status = 'rejected'
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_rejected', { score: review.score })
    }
    return recipe
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && npx jest src/recipes/recipes.service.spec.ts`
Expected: PASS, all tests green (existing + 4 new duplicate-related ones)

- [ ] **Step 6: Run the full backend suite**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green

- [ ] **Step 7: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/schemas/recipe.schema.ts api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: block submitForReview on AI-judged duplicate recipes"
```

---

### Task 4: Dispute endpoints

**Files:**
- Create: `api/src/recipes/dto/dispute-duplicate.dto.ts`
- Create: `api/src/recipes/dto/resolve-duplicate-dispute.dto.ts`
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`
- Modify: `api/src/recipes/recipes.controller.ts`
- Modify: `api/src/recipes/recipes.controller.spec.ts`

**Interfaces:**
- Consumes: `getEditableOrThrow` (existing private-ish method already used by `submitForReview`), `recipe.duplicateReview`/`disputeStatus`/`duplicateCheckOverride` from Task 3.
- Produces (used by Task 5/6 frontend): `POST /recipes/:id/dispute-duplicate`, `GET /recipes/disputes`, `POST /recipes/:id/dispute-duplicate/resolve`.

- [ ] **Step 1: Create the DTOs**

Create `api/src/recipes/dto/dispute-duplicate.dto.ts`:

```typescript
import { IsOptional, IsString } from 'class-validator'

export class DisputeDuplicateDto {
  @IsString()
  @IsOptional()
  message?: string
}
```

Create `api/src/recipes/dto/resolve-duplicate-dispute.dto.ts`:

```typescript
import { IsBoolean } from 'class-validator'

export class ResolveDuplicateDisputeDto {
  @IsBoolean()
  approve!: boolean
}
```

- [ ] **Step 2: Write the failing service tests**

In `api/src/recipes/recipes.service.spec.ts`, add these tests after the duplicate-detection tests added in Task 3:

```typescript
  it('disputeDuplicate sets disputeStatus to pending on a duplicate-blocked recipe', async () => {
    const recipe: any = completeRecipe({ duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' } })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    const result = await service.disputeDuplicate('a', 'user_1', false, 'I made this myself')

    expect(recipe.disputeStatus).toBe('pending')
    expect(recipe.disputeMessage).toBe('I made this myself')
    expect(recipe.disputeCreatedAt).toBeInstanceOf(Date)
    expect(recipe.save).toHaveBeenCalled()
    expect(result).toBe(recipe)
  })

  it('disputeDuplicate throws when the recipe was not blocked as a duplicate', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.disputeDuplicate('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('disputeDuplicate throws when already disputed', async () => {
    const recipe: any = completeRecipe({
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.disputeDuplicate('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('listDuplicateDisputes queries recipes with a pending dispute', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ _id: 'a' }]) })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    const result = await service.listDuplicateDisputes()

    expect(find).toHaveBeenCalledWith({ disputeStatus: 'pending', deletedAt: { $exists: false } })
    expect(result).toEqual([{ _id: 'a' }])
  })

  it('resolveDuplicateDispute approving sets duplicateCheckOverride and resets status to draft', async () => {
    const recipe: any = completeRecipe({
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    const result = await service.resolveDuplicateDispute('a', true)

    expect(recipe.disputeStatus).toBe('approved')
    expect(recipe.duplicateCheckOverride).toBe(true)
    expect(recipe.status).toBe('draft')
    expect(recipe.disputeResolvedAt).toBeInstanceOf(Date)
    expect(result).toBe(recipe)
  })

  it('resolveDuplicateDispute denying leaves the recipe rejected', async () => {
    const recipe: any = completeRecipe({
      duplicateReview: { isDuplicate: true, matchedRecipeId: 'other-1', matchedRecipeTitle: 'Other', reason: 'x', checkedAt: 'now' },
      disputeStatus: 'pending',
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await service.resolveDuplicateDispute('a', false)

    expect(recipe.disputeStatus).toBe('denied')
    expect(recipe.duplicateCheckOverride).toBe(false)
    expect(recipe.status).toBe('rejected')
  })

  it('resolveDuplicateDispute throws when there is no pending dispute', async () => {
    const recipe: any = completeRecipe({ disputeStatus: 'none' })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const service = await makeService({ findOne })

    await expect(service.resolveDuplicateDispute('a', true)).rejects.toThrow(BadRequestException)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api && npx jest src/recipes/recipes.service.spec.ts -t "isputeDuplicate"`
Expected: FAIL — `service.disputeDuplicate is not a function` etc.

- [ ] **Step 4: Implement the service methods**

In `api/src/recipes/recipes.service.ts`, add these three methods right after `submitForReview` (which Task 3 already modified):

```typescript
  async disputeDuplicate(id: string, userId: string, isAdmin: boolean, message?: string): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    if (!recipe.duplicateReview?.isDuplicate) {
      throw new BadRequestException('This recipe was not blocked as a duplicate')
    }
    if (recipe.disputeStatus !== 'none') {
      throw new BadRequestException(`This recipe's duplicate block has already been disputed (status: ${recipe.disputeStatus})`)
    }
    recipe.disputeStatus = 'pending'
    recipe.disputeMessage = message
    recipe.disputeCreatedAt = new Date()
    await recipe.save()
    return recipe
  }

  async listDuplicateDisputes(): Promise<RecipeDocument[]> {
    return this.recipeModel.find({ disputeStatus: 'pending', deletedAt: { $exists: false } }).sort({ disputeCreatedAt: 1 }).exec()
  }

  async resolveDuplicateDispute(id: string, approve: boolean): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec()
    if (!recipe) {
      throw new NotFoundException(`Recipe '${id}' not found`)
    }
    if (recipe.disputeStatus !== 'pending') {
      throw new BadRequestException(`This recipe has no pending dispute (status: ${recipe.disputeStatus})`)
    }
    recipe.disputeResolvedAt = new Date()
    if (approve) {
      recipe.disputeStatus = 'approved'
      recipe.duplicateCheckOverride = true
      recipe.status = 'draft'
    } else {
      recipe.disputeStatus = 'denied'
    }
    await recipe.save()
    return recipe
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npx jest src/recipes/recipes.service.spec.ts`
Expected: PASS, all tests green

- [ ] **Step 6: Write the failing controller tests**

In `api/src/recipes/recipes.controller.spec.ts`, add `disputeDuplicate`, `listDuplicateDisputes`, `resolveDuplicateDispute` to the `recipesService` mock object (alongside the existing `submitForReview: jest.fn()`):

```typescript
    disputeDuplicate: jest.fn(),
    listDuplicateDisputes: jest.fn(),
    resolveDuplicateDispute: jest.fn(),
```

Then add these tests at the end of the `describe` block:

```typescript
  it('POST /recipes/:id/dispute-duplicate disputes the block and logs the activity', async () => {
    const disputed = { toObject: () => ({ slug: 'a', status: 'rejected', disputeStatus: 'pending' }) }
    recipesService.disputeDuplicate.mockResolvedValue(disputed)
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const config = { get: jest.fn().mockReturnValue('admin_1') }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    const result = await controller.disputeDuplicate('a', { message: 'not a duplicate' }, { userId: 'user_1' } as any)

    expect(recipesService.disputeDuplicate).toHaveBeenCalledWith('a', 'user_1', false, 'not a duplicate')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_duplicate_disputed')
    expect(result).toEqual({ slug: 'a', status: 'rejected', disputeStatus: 'pending' })
  })

  it('GET /recipes/disputes returns the pending disputes for the app owner', async () => {
    recipesService.listDuplicateDisputes.mockResolvedValue([{ toObject: () => ({ slug: 'a' }) }])
    const config = { get: jest.fn().mockReturnValue('owner_1') }
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    const result = await controller.listDuplicateDisputes({ userId: 'owner_1' } as any)

    expect(result).toEqual([{ slug: 'a' }])
  })

  it('GET /recipes/disputes throws ForbiddenException for a non-owner', async () => {
    const config = { get: jest.fn().mockReturnValue('owner_1') }
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    await expect(controller.listDuplicateDisputes({ userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
  })

  it('POST /recipes/:id/dispute-duplicate/resolve approves for the app owner and logs the activity', async () => {
    const resolved = { toObject: () => ({ slug: 'a', status: 'draft', disputeStatus: 'approved' }) }
    recipesService.resolveDuplicateDispute.mockResolvedValue(resolved)
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const config = { get: jest.fn().mockReturnValue('owner_1') }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    const result = await controller.resolveDuplicateDispute('a', { approve: true }, { userId: 'owner_1' } as any)

    expect(recipesService.resolveDuplicateDispute).toHaveBeenCalledWith('a', true)
    expect(activityLog.record).toHaveBeenCalledWith('owner_1', 'a', 'recipe_duplicate_dispute_approved')
    expect(result).toEqual({ slug: 'a', status: 'draft', disputeStatus: 'approved' })
  })

  it('POST /recipes/:id/dispute-duplicate/resolve throws ForbiddenException for a non-owner', async () => {
    const config = { get: jest.fn().mockReturnValue('owner_1') }
    const activityLog = { record: jest.fn(), trendingIds: jest.fn() }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any, usersService as any)

    await expect(controller.resolveDuplicateDispute('a', { approve: false }, { userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
  })
```

Add `ForbiddenException` to the test file's import from `@nestjs/common`:

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common'
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd api && npx jest src/recipes/recipes.controller.spec.ts -t "dispute"`
Expected: FAIL — `controller.disputeDuplicate is not a function` etc.

- [ ] **Step 8: Implement the controller endpoints**

In `api/src/recipes/recipes.controller.ts`, add `ForbiddenException` to the existing `@nestjs/common` import:

```typescript
import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Req } from '@nestjs/common'
```

Add the DTO imports:

```typescript
import { DisputeDuplicateDto } from './dto/dispute-duplicate.dto'
import { ResolveDuplicateDisputeDto } from './dto/resolve-duplicate-dispute.dto'
```

Add a `GET disputes` route right after the existing `@Get('submissions')` handler (`listRecentSubmissions`) and before `@Get('public/:id')`, so the literal `disputes` path is matched before the `:id` wildcard route further down:

```typescript
  @Get('disputes')
  async listDuplicateDisputes(@Req() req: Request & { userId: string }) {
    if (!this.isAdmin(req.userId)) {
      throw new ForbiddenException('Only the app owner can view duplicate disputes')
    }
    const recipes = await this.recipesService.listDuplicateDisputes()
    return recipes.map(r => r.toObject())
  }
```

Add the dispute and resolve endpoints right after the existing `@Post(':id/submit')` handler (`submit`):

```typescript
  @Post(':id/dispute-duplicate')
  async disputeDuplicate(
    @Param('id') id: string,
    @Body() body: DisputeDuplicateDto,
    @Req() req: Request & { userId: string },
  ) {
    const recipe = await this.recipesService.disputeDuplicate(id, req.userId, this.isAdmin(req.userId), body.message)
    await this.activityLog.record(req.userId, id, 'recipe_duplicate_disputed')
    return recipe.toObject()
  }

  @Post(':id/dispute-duplicate/resolve')
  async resolveDuplicateDispute(
    @Param('id') id: string,
    @Body() body: ResolveDuplicateDisputeDto,
    @Req() req: Request & { userId: string },
  ) {
    if (!this.isAdmin(req.userId)) {
      throw new ForbiddenException('Only the app owner can resolve duplicate disputes')
    }
    const recipe = await this.recipesService.resolveDuplicateDispute(id, body.approve)
    await this.activityLog.record(req.userId, id, body.approve ? 'recipe_duplicate_dispute_approved' : 'recipe_duplicate_dispute_denied')
    return recipe.toObject()
  }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd api && npx jest src/recipes/recipes.controller.spec.ts`
Expected: PASS, all tests green

- [ ] **Step 10: Run the full backend suite**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green

- [ ] **Step 11: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/dto/dispute-duplicate.dto.ts api/src/recipes/dto/resolve-duplicate-dispute.dto.ts api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts api/src/recipes/recipes.controller.ts api/src/recipes/recipes.controller.spec.ts
git commit -m "feat: add duplicate-dispute endpoints (dispute, list, resolve)"
```

---

### Task 5: Frontend data layer (types, hooks, i18n)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/hooks/useRecipes.ts`
- Modify: `src/i18n.ts`

**Interfaces:**
- Produces (used by Task 6): `Recipe.duplicateReview`/`disputeStatus`/`disputeMessage` fields; `disputeDuplicate(id, message, getToken): Promise<Recipe>`; `useDuplicateDisputes()` hook returning `{ recipes, loading, reload }`; `resolveDuplicateDispute(id, approve, getToken): Promise<Recipe>`; new `tx.*` i18n keys listed in Step 3.

- [ ] **Step 1: Add the new fields to the `Recipe` type**

In `src/types.ts`, add this interface right after `QualityReview` (before `export interface RecipeRevision`):

```typescript
export interface DuplicateReview {
  isDuplicate: boolean
  matchedRecipeId: string
  matchedRecipeTitle: string
  reason: string
  checkedAt: string
}
```

Add these fields to the `Recipe` interface, right after `qualityReview?: QualityReview`:

```typescript
  duplicateReview?: DuplicateReview
  disputeStatus?: 'none' | 'pending' | 'approved' | 'denied'
  disputeMessage?: string
```

- [ ] **Step 2: Add the dispute functions and admin hook to useRecipes.ts**

In `src/hooks/useRecipes.ts`, add these functions right after the existing `submitForReview` function:

```typescript
export async function disputeDuplicate(id: string, message: string | undefined, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/dispute-duplicate`, getToken, message ? { message } : undefined)
  notifyRecipeStatusChanged()
  return recipe
}

export async function resolveDuplicateDispute(id: string, approve: boolean, getToken: () => Promise<string | null>): Promise<Recipe> {
  const recipe = await postAction(`/recipes/${id}/dispute-duplicate/resolve`, getToken, { approve })
  notifyRecipeStatusChanged()
  return recipe
}
```

Add this hook right after the existing `useSubmissionsFeed` hook:

```typescript
// Admin-only: recipes with a pending duplicate-block dispute. The backend
// itself 403s a non-owner call - this hook is only ever mounted from the
// owner-gated section of SubmissionsPage.
export function useDuplicateDisputes(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/disputes', getToken).then(data => setRecipes(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return
    let cancelled = false

    reload()
      .catch(() => { /* stale admin panel is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    const unsubscribe = onRecipeStatusChanged(() => { reload().catch(() => {}) })
    return () => { cancelled = true; unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, getToken])

  return { recipes, loading, reload }
}
```

- [ ] **Step 3: Add the new i18n keys**

In `src/i18n.ts`, insert these keys as the last entries of the `he` object — immediately before the closing `},` on the line right after `shortcutShowHelp: 'הצגת המקשים האלה',` (currently line 425):

```typescript
      duplicateBlockedTitle: 'המתכון הזה נראה כפול',
      duplicateBlockedIntro: (title: string) => `הוא נחסם כי הוא דומה מדי למתכון קיים: "${title}"`,
      viewSimilarRecipe: 'צפה במתכון הדומה',
      disputeThisDecision: 'ערער על ההחלטה',
      disputeSubmitted: 'הערעור נשלח - הבעלים יבדוק אותו',
      disputeUnderReview: 'הערעור נבדק על ידי הבעלים',
      disputeWasDenied: 'הערעור נדחה - ערכו את המתכון והגישו שוב',
      duplicateDisputes: 'ערעורים על כפילות',
      noDuplicateDisputes: 'אין ערעורים ממתינים',
      approveDispute: 'אשר',
      denyDispute: 'דחה',
```

Insert these keys as the last entries of the `en` object — immediately before the closing `},` on the line right after `shortcutShowHelp: 'Show this help',` (currently line 815):

```typescript
    duplicateBlockedTitle: 'This recipe looks like a duplicate',
    duplicateBlockedIntro: (title: string) => `It was blocked for being too similar to an existing recipe: "${title}"`,
    viewSimilarRecipe: 'View the similar recipe',
    disputeThisDecision: 'Dispute this decision',
    disputeSubmitted: 'Dispute submitted - the owner will review it',
    disputeUnderReview: 'Under review by the app owner',
    disputeWasDenied: 'Dispute denied - edit the recipe and resubmit',
    duplicateDisputes: 'Duplicate disputes',
    noDuplicateDisputes: 'No pending disputes',
    approveDispute: 'Approve',
    denyDispute: 'Deny',
```

- [ ] **Step 4: Verify the frontend builds and type-checks**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/types.ts src/hooks/useRecipes.ts src/i18n.ts
git commit -m "feat: add frontend types/hooks/i18n for duplicate-dispute workflow"
```

---

### Task 6: Frontend UI (duplicate banner + admin disputes panel)

**Files:**
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/components/SubmissionsPage.tsx`

**Interfaces:**
- Consumes: `disputeDuplicate`, `resolveDuplicateDispute`, `useDuplicateDisputes` from Task 5's `useRecipes.ts`; `recipe.duplicateReview`/`disputeStatus` from Task 5's `types.ts`; the `tx.duplicate*`/`tx.dispute*` i18n keys from Task 5.

- [ ] **Step 1: Add dispute state and handler to RecipeDetail.tsx**

In `src/components/RecipeDetail.tsx`, add `disputeDuplicate` to the existing import from `../hooks/useRecipes` (currently `import { useRecipe, useRecipes, deleteRecipe, submitForReview } from '../hooks/useRecipes'`):

```typescript
import { useRecipe, useRecipes, deleteRecipe, submitForReview, disputeDuplicate } from '../hooks/useRecipes'
```

Add a `disputing` state near the other submission-related state (next to `const [submitting, setSubmitting] = useState(...)` — find it near the top of the component and add right after it):

```typescript
  const [disputing, setDisputing] = useState(false)
```

Add this handler near `handleSubmitForReview` (right after it):

```typescript
  async function handleDisputeDuplicate() {
    if (!id) return
    setDisputing(true)
    try {
      await disputeDuplicate(id, undefined, getToken)
      showToast(tx.disputeSubmitted, 'success')
      await reloadRecipe()
    } catch {
      showToast(tx.somethingWentWrong ?? 'Something went wrong', 'error')
    } finally {
      setDisputing(false)
    }
  }
```

(If `tx.somethingWentWrong` doesn't exist in `src/i18n.ts`, check for the nearest equivalent generic-error key already used elsewhere in this file for a failed action and use that instead — search the file for the pattern used in the nearby `catch` block of `handleSubmitForReview`.)

- [ ] **Step 2: Add the duplicate banner**

In `src/components/RecipeDetail.tsx`, add this block immediately before the existing "AI review results" banner (the block starting with `{canEdit && review && recipe.status !== 'published' && (`):

```typescript
          {canEdit && recipe.status === 'rejected' && recipe.duplicateReview?.isDuplicate && (
            <div className="card p-4 mb-4 border border-red-400/20">
              <p className="text-sm font-semibold text-cream mb-1">{tx.duplicateBlockedTitle}</p>
              <p className="text-xs text-cream/60 mb-3">{tx.duplicateBlockedIntro(recipe.duplicateReview.matchedRecipeTitle)}</p>
              <div className="flex items-center gap-3">
                <Link to={`/recipes/${recipe.duplicateReview.matchedRecipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors">
                  {tx.viewSimilarRecipe}
                </Link>
                {recipe.disputeStatus === 'none' && (
                  <button type="button" onClick={handleDisputeDuplicate} disabled={disputing} className="btn-ghost text-xs">
                    {tx.disputeThisDecision}
                  </button>
                )}
                {recipe.disputeStatus === 'pending' && (
                  <span className="text-xs text-cream/40">{tx.disputeUnderReview}</span>
                )}
                {recipe.disputeStatus === 'denied' && (
                  <span className="text-xs text-cream/40">{tx.disputeWasDenied}</span>
                )}
              </div>
            </div>
          )}

```

- [ ] **Step 3: Verify manually in the browser**

Run: `cd /Users/tugy/git/recipes && npm run dev` (if not already running)

As the signed-in owner of a draft recipe, use the browser dev tools or a temporary `console.log` to confirm `recipe.duplicateReview` renders the banner correctly once a duplicate block exists (this can't be exercised end-to-end without a live Gemini call, so this is a visual/layout check using React DevTools to temporarily force `recipe.status = 'rejected'` and `recipe.duplicateReview = { isDuplicate: true, matchedRecipeId: '...', matchedRecipeTitle: 'Test Recipe', reason: 'x', checkedAt: 'now' }` in state, or by checking the JSX renders without errors via `npm run build`).

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 4: Add the admin disputes panel to SubmissionsPage.tsx**

In `src/components/SubmissionsPage.tsx`, add these imports:

```typescript
import { OWNER_USER_ID } from '../lib/admin'
import { useDuplicateDisputes, resolveDuplicateDispute } from '../hooks/useRecipes'
```

Add a `DisputeCard` component, right after the existing `SubmissionCard` component (before `export default function SubmissionsPage()`):

```typescript
interface DisputeCardProps {
  recipe: Recipe
  onResolved: () => void
}

function DisputeCard({ recipe: r, onResolved }: DisputeCardProps) {
  const { lang } = useLanguage()
        const tx = t[lang]
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [resolving, setResolving] = useState(false)

  async function resolve(approve: boolean) {
    setResolving(true)
    try {
      await resolveDuplicateDispute(r.id, approve, getToken)
      onResolved()
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="card p-4">
      <button type="button" onClick={() => navigate(`/recipes/${r.id}`)} className="font-serif text-base font-medium text-cream hover:text-amber transition-colors text-start block mb-1">
        {r.title}
      </button>
      {r.duplicateReview && (
        <>
          <p className="text-xs text-cream/50 mb-1">
            {tx.duplicateBlockedIntro(r.duplicateReview.matchedRecipeTitle)}
          </p>
          <p className="text-xs text-cream/30 mb-3">{r.duplicateReview.reason}</p>
        </>
      )}
      {r.duplicateReview && (
        <Link to={`/recipes/${r.duplicateReview.matchedRecipeId}`} className="text-xs text-amber hover:text-amber/80 transition-colors">
          {tx.viewSimilarRecipe}
        </Link>
      )}
      <div className="flex items-center gap-2 mt-3">
        <button type="button" disabled={resolving} onClick={() => resolve(true)} className="btn-ghost text-xs">
          {tx.approveDispute}
        </button>
        <button type="button" disabled={resolving} onClick={() => resolve(false)} className="btn-ghost text-xs">
          {tx.denyDispute}
        </button>
      </div>
    </div>
  )
}
```

Add `Link` to the existing `react-router-dom` import (currently `import { useNavigate } from 'react-router-dom'`):

```typescript
import { Link, useNavigate } from 'react-router-dom'
```

Add `useAuth`'s `userId` alongside the existing `getToken` destructure inside `SubmissionsPage` — find the line `const { lang } = useLanguage()` at the top of `SubmissionsPage` and add right after it:

```typescript
  const { userId } = useAuth()
  const isOwner = userId === OWNER_USER_ID
  const { recipes: disputes, loading: disputesLoading, reload: reloadDisputes } = useDuplicateDisputes(isOwner)
```

Add `useAuth` to the existing `@clerk/react` import at the top of the file (currently `import { useAuth } from '@clerk/react'`) — it's already imported, no change needed there.

Add the disputes section to the returned JSX, right after the closing `</p>` of the intro paragraph (`{tx.recentAIQualityReviewOutcomesAcross}`) and before the `{loading ? (` block:

```typescript
        {isOwner && !disputesLoading && disputes.length > 0 && (
          <div className="mb-8">
            <h2 className="font-serif text-lg font-bold text-cream mb-3">{tx.duplicateDisputes}</h2>
            <div className="space-y-3">
              {disputes.map(r => (
                <DisputeCard key={r.id} recipe={r} onResolved={reloadDisputes} />
              ))}
            </div>
          </div>
        )}

```

- [ ] **Step 5: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 6: Run the React Hooks lint check (matches the CI gate in `.github/workflows/deploy.yaml`)**

Run:
```bash
cd /Users/tugy/git/recipes
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-report.json
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-report.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
if (hookIssues.length > 0) { console.error('React Hooks rule violations found:'); console.error(JSON.stringify(hookIssues, null, 2)); process.exit(1); }
console.log('No react-hooks violations found.');
"
```
Expected: `No react-hooks violations found.`

- [ ] **Step 7: Manually verify in the browser**

Run: `cd /Users/tugy/git/recipes && npm run dev` (if not already running), sign in as the app owner (`OWNER_USER_ID`), navigate to the Submissions page, and confirm the page renders without errors (the disputes section will be empty until a real duplicate block + dispute exists — that's expected, it only needs to not crash and to be hidden for non-owner accounts).

- [ ] **Step 8: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/RecipeDetail.tsx src/components/SubmissionsPage.tsx
git commit -m "feat: add duplicate-block banner and admin disputes panel to the UI"
```

---

## Self-Review Notes

- **Spec coverage:** candidate search (Task 1/2), AI judge (Task 2), submit gating (Task 3), dispute → admin workflow (Task 4), frontend types/hooks/i18n (Task 5), banner + admin panel (Task 6). Item-grouping is explicitly out of scope per the spec.
- **Type consistency:** `SimilarityCandidate`/`SimilaritySourceRecipe`/`DuplicateVerdict` (Task 2) match the shapes consumed in Task 3's `submitForReview`. `Recipe.duplicateReview`/`disputeStatus` (Task 5 frontend types) mirror the backend schema fields (Task 3) exactly.
- **No placeholders:** every step has literal code, not descriptions.
