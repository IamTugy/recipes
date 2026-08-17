# AI Review Required/Suggestion Buckets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (subagent-driven-development is unavailable this session — spawn limit reached). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split AI review findings into a `required` bucket (affects score) and a `suggestion` bucket (informational only), and let the owner pick per-finding which suggested fixes get pre-filled into the editor via checkboxes before clicking "Submit".

**Architecture:** Backend: each `QualityFinding` gains `bucket: 'required'|'suggestion'` and an optional per-finding `suggestedFix`; `computeScore` only deducts for `required` findings; the Gemini prompt is rewritten to ask for both fields, with a rule to avoid two findings claiming `suggestedFix` for the same field. Frontend: `RecipeDetail.tsx` renders two finding lists with checkboxes (unchecked by default) and a "Submit" button that passes selected finding indices via `?applySuggestions=1&findings=0,2,5`; `EditRecipePage.tsx` resolves those indices to their `suggestedFix` values and merges them into the form's initial values; `RecipeForm.tsx`'s auto-fixed highlight switches from field-name matching to finding-index matching.

**Tech Stack:** NestJS (api/), React/Vite (src/), Jest for backend tests, no frontend test framework (build + eslint is the bar per existing convention).

## Global Constraints

- No DB migration: `qualityReview` is Mongoose `Mixed`, overwritten each resubmission. Legacy review documents (old shape, no `bucket`) must render safely: treat every finding without a `bucket` as `'required'` and without `suggestedFix` as having no checkbox.
- `computeScore` penalty table unchanged: `{critical: 25, major: 10, minor: 3}`. Only findings with `bucket === 'required'` are summed.
- Publish threshold unchanged: `RecipesService.PUBLISH_THRESHOLD = 95` (api/src/recipes/recipes.service.ts:470) — untouched, it just now receives a score computed from required-only findings.
- Checkboxes default **unchecked** (opt-in).
- Query string convention: extend `?applySuggestions=1` with `&findings=<comma-separated indices>`, no React Router navigation state.
- `useTranslatedReview.ts` needs NO changes — it spreads `...f` when mapping findings, so `bucket`/`suggestedFix` pass through automatically.

---

### Task 1: Backend — bucket + per-finding suggestedFix in RecipeQualityService

**Files:**
- Modify: `api/src/recipes/quality/recipe-quality.service.ts` (full file, 108 lines)
- Test: `api/src/recipes/quality/recipe-quality.service.spec.ts`

**Interfaces:**
- Produces: `export type FindingBucket = 'required' | 'suggestion'`; `QualityFinding { category: string; severity: FindingSeverity; bucket: FindingBucket; message: string; field?: string; suggestedFix?: Record<string, unknown> }`; `QualityReview { score: number; checkedAt: string; findings: QualityFinding[] }` (no more top-level `suggestedFields`); `computeScore(findings: QualityFinding[]): number` sums `PENALTY[f.severity]` only where `f.bucket === 'required'`.

- [ ] **Step 1: Write failing tests for bucket-aware scoring**

Add to `api/src/recipes/quality/recipe-quality.service.spec.ts`, replacing the existing `'deducts fixed points per finding by severity'` test (it still needs `bucket: 'required'` on each finding to keep passing) and the `'passes suggestedFields through'` test entirely (that mechanism is gone). Full replacement content for the file:

```typescript
import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { RecipeQualityService } from './recipe-quality.service'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeQualityService', () => {
  const generateStructuredWithImage = jest.fn()
  const gemini = { generateStructuredWithImage }

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => new Uint8Array(Buffer.from('image-bytes')).buffer,
    }) as unknown as typeof fetch
  })

  async function makeService() {
    const config = { get: jest.fn(() => 'https://recipes-assets.tugy.dev') }
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeQualityService,
        { provide: GeminiService, useValue: gemini },
        { provide: ConfigService, useValue: config },
      ],
    }).compile()
    return moduleRef.get(RecipeQualityService)
  }

  const recipe = { image: 'https://recipes-assets.tugy.dev/recipes/x/photo.jpg', title: 'Soup' }

  it('scores 100 when there are no findings', async () => {
    generateStructuredWithImage.mockResolvedValue({ findings: [] })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100)
    expect(result.findings).toEqual([])
  })

  it('deducts fixed points per finding by severity, for required findings only', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'image', severity: 'critical', bucket: 'required', message: 'blurry' },
        { category: 'translation', severity: 'major', bucket: 'required', message: 'missing english' },
        { category: 'polish', severity: 'minor', bucket: 'required', message: 'typo' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100 - 25 - 10 - 3)
  })

  it('does not deduct points for suggestion-bucket findings, regardless of severity', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'seasoning', severity: 'major', bucket: 'suggestion', message: 'less MSG would be nicer' },
        { category: 'polish', severity: 'critical', bucket: 'suggestion', message: 'stylistic nit' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(100)
  })

  it('floors the score at 0 rather than going negative', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'a', severity: 'critical', bucket: 'required', message: '1' },
        { category: 'b', severity: 'critical', bucket: 'required', message: '2' },
        { category: 'c', severity: 'critical', bucket: 'required', message: '3' },
        { category: 'd', severity: 'critical', bucket: 'required', message: '4' },
        { category: 'e', severity: 'critical', bucket: 'required', message: '5' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.score).toBe(0)
  })

  it('passes each finding through including its own suggestedFix', async () => {
    generateStructuredWithImage.mockResolvedValue({
      findings: [
        { category: 'translation', severity: 'minor', bucket: 'required', message: 'awkward phrasing', field: 'descriptionEn', suggestedFix: { descriptionEn: 'A better description.' } },
        { category: 'seasoning', severity: 'minor', bucket: 'suggestion', message: 'less MSG' },
      ],
    })
    const service = await makeService()

    const result = await service.review(recipe)

    expect(result.findings[0].suggestedFix).toEqual({ descriptionEn: 'A better description.' })
    expect(result.findings[1].suggestedFix).toBeUndefined()
  })

  it('sends the recipe image and JSON to Gemini', async () => {
    generateStructuredWithImage.mockResolvedValue({ findings: [] })
    const service = await makeService()

    await service.review(recipe)

    expect(global.fetch).toHaveBeenCalledWith(recipe.image)
    const [prompt, imageData, mimeType, temperature] = generateStructuredWithImage.mock.calls[0]
    expect(prompt).toContain(JSON.stringify(recipe))
    expect(imageData).toBe(Buffer.from('image-bytes').toString('base64'))
    expect(mimeType).toBe('image/jpeg')
    expect(temperature).toBe(0)
  })

  it('rejects image URLs outside of our own bucket', async () => {
    const service = await makeService()

    await expect(service.review({ ...recipe, image: 'https://evil.example.com/steal.jpg' }))
      .rejects.toThrow('Recipe image must be an uploaded photo')
    expect(generateStructuredWithImage).not.toHaveBeenCalled()
  })

  it('throws when the recipe image cannot be fetched', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    const service = await makeService()

    await expect(service.review(recipe)).rejects.toThrow('Could not fetch the recipe image')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipe-quality.service.spec.ts`
Expected: FAIL — `bucket`-aware deduction test fails because `computeScore` still sums every finding; the `suggestedFix` per-finding test fails because the response type/passthrough doesn't carry `suggestedFix` per finding yet (current code only threads a top-level `suggestedFields`).

- [ ] **Step 3: Rewrite `recipe-quality.service.ts`**

Full replacement content:

```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GeminiService } from '../../ai/gemini.service'

export type FindingSeverity = 'critical' | 'major' | 'minor'
export type FindingBucket = 'required' | 'suggestion'

export interface QualityFinding {
  category: string
  severity: FindingSeverity
  // 'required' findings threaten accuracy/safety/consistency and count
  // toward the score; 'suggestion' findings are stylistic nudges the owner
  // is free to ignore and never affect the score.
  bucket: FindingBucket
  message: string
  field?: string
  // Full replacement value for `field`, not a diff - same semantics as
  // the old top-level suggestedFields, just scoped to this one finding so
  // the owner can select which specific fixes to apply.
  suggestedFix?: Record<string, unknown>
}

export interface QualityReview {
  score: number
  checkedAt: string
  findings: QualityFinding[]
}

interface GeminiReviewResponse {
  findings: QualityFinding[]
}

// Fixed point deduction per finding severity - the score is computed here,
// not by asking Gemini to freehand a percentage, so it's consistent and
// auditable across calls instead of a black-box number the model invents.
const PENALTY: Record<FindingSeverity, number> = { critical: 25, major: 10, minor: 3 }

const REVIEW_PROMPT = `You are reviewing a home-cooking recipe submission before it's allowed to publish on a recipe-sharing app. You are given the recipe's photo and its full content as JSON below.

Check for all of the following and report a finding for each problem you find (no finding for things that are fine):

- Quantities that don't make sense (wildly wrong amount for the dish, or for the stated servings)
- The photo doesn't look like real food, is low quality/blurry/unusable, or doesn't match the dish described
- Missing or incomplete steps for a dish that clearly needs them
- Steps that would benefit from a timer but have none set - check the actual "timerMinutes" field on that step in the JSON before flagging this; if it's already a number, the timer is set and this is NOT a finding, regardless of how the instruction text reads (use judgment on which steps need one at all - not every step does)
- Ingredients listed but never referenced in any step, or a step referencing an ingredient that isn't listed
- Duplicate or near-duplicate ingredient entries
- An ingredient with an empty unit where that's actually wrong: empty unit is fine for a naturally countable whole item ("1 onion", "10 grapes", "1 garlic clove"), but wrong for something measured by mass/volume ("1 milk" or "1 butter" needs a unit like g or ml)
- The exact same source URL appearing more than once in "sources"
- Servings count doesn't match the scale of the ingredient quantities
- Category or difficulty tag doesn't match the actual content
- Prep/cook time is implausible for what the steps describe
- Poor translation quality or missing translation between the Hebrew and English fields (if both are present)
- Inappropriate, offensive, or 18+ content anywhere in the text
- Matters of taste or preference that don't threaten correctness: ingredient quantities that are unusual but not wrong (e.g. an unusually high or low amount of a seasoning like salt or MSG), stylistic wording choices, optional polish

Be exhaustive: go through every check in the list above one by one and report every problem you find, not just the most obvious ones. The owner only gets to see this list once per submission, so a check that's silently skipped this round means a real problem ships or comes back as a surprise on a future resubmission - don't hold anything back for a "later" pass.

For each finding, set "severity" to "critical" (recipe is unusable/wrong/inappropriate as-is), "major" (a real problem but the recipe is still usable), or "minor" (small polish issue).

For each finding, also set "bucket" to either "required" or "suggestion":
- "required": anything threatening accuracy, safety, translation quality, or internal consistency of the recipe - the owner must address it (or it will keep blocking publish).
- "suggestion": a stylistic or preference nudge that doesn't need fixing to publish - the owner is free to ignore it. Example: the amount of a seasoning like MSG being higher or lower than typical is a "suggestion", not a "required" finding, because it doesn't threaten the recipe's integrity - it's the owner's creative choice. Text issues (missing/wrong/awkward translation, typos, inconsistent instructions) and any real inconsistency (ingredients not matching steps, servings not matching quantities, etc.) are always "required".

If you can confidently fix a finding by rewriting the affected field(s), include your fix in that finding's own "suggestedFix". Only set "suggestedFix" on a finding you're actually suggesting a change for. If you suggest a change to ingredients or steps, include the ENTIRE corrected ingredients or steps array in "suggestedFix" (not just the changed item) - it fully replaces the current value, it is not a partial patch. If two or more findings would both touch the same field, only put "suggestedFix" on ONE of them (the one whose fix should win) - never let two findings both claim a fix for the same field, since only one can actually be applied.

Return ONLY JSON matching this shape:
{"findings": [{"category": string, "severity": "critical"|"major"|"minor", "bucket": "required"|"suggestion", "message": string, "field": string (optional), "suggestedFix": object (optional)}]}

Recipe JSON:
`

@Injectable()
export class RecipeQualityService {
  private readonly publicUrl: string

  constructor(
    private readonly gemini: GeminiService,
    private readonly config: ConfigService,
  ) {
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL')!
  }

  async review(recipe: Record<string, unknown>): Promise<QualityReview> {
    const imageUrl = String(recipe.image ?? '')
    const { data, mimeType } = await this.fetchImage(imageUrl)

    const prompt = `${REVIEW_PROMPT}${JSON.stringify(recipe)}`
    // Low temperature: this is a checklist pass, not creative writing - keeping
    // it near-deterministic means a resubmission with the same unresolved
    // issue reliably surfaces it again instead of the model happening to omit
    // it on one call and report it on the next.
    const response = await this.gemini.generateStructuredWithImage<GeminiReviewResponse>(prompt, data, mimeType, 0)
    const findings = response.findings ?? []
    const score = this.computeScore(findings)

    return {
      score,
      checkedAt: new Date().toISOString(),
      findings,
    }
  }

  private computeScore(findings: QualityFinding[]): number {
    const deduction = findings
      .filter(f => f.bucket === 'required')
      .reduce((sum, f) => sum + (PENALTY[f.severity] ?? 0), 0)
    return Math.max(0, 100 - deduction)
  }

  private async fetchImage(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    if (!imageUrl.startsWith(`${this.publicUrl}/`)) {
      throw new Error('Recipe image must be an uploaded photo')
    }
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error('Could not fetch the recipe image')
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
    return { data: buffer.toString('base64'), mimeType }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipe-quality.service.spec.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/recipes/quality/recipe-quality.service.ts api/src/recipes/quality/recipe-quality.service.spec.ts
git commit -m "feat: add required/suggestion buckets and per-finding fixes to AI review"
```

---

### Task 2: Backend — update recipe.schema.ts type annotation

**Files:**
- Modify: `api/src/recipes/schemas/recipe.schema.ts:116-124`

**Interfaces:**
- Consumes: `FindingBucket`, `QualityFinding` shape from Task 1 (not imported — this is a `Mixed`-typed Mongoose field, the TS annotation is documentation only, duplicated inline like the existing code already does for `duplicateReview`).

- [ ] **Step 1: Update the `qualityReview` type annotation**

In `api/src/recipes/schemas/recipe.schema.ts`, replace lines 116-124:

```typescript
  // Result of the automated AI quality review that gates publishing.
  // Overwritten on each resubmission - no history kept for v1.
  @Prop({ type: MongooseSchema.Types.Mixed })
  qualityReview?: {
    score: number
    checkedAt: string
    findings: { category: string; severity: 'critical' | 'major' | 'minor'; message: string; field?: string }[]
    suggestedFields?: Record<string, unknown>
  }
```

with:

```typescript
  // Result of the automated AI quality review that gates publishing.
  // Overwritten on each resubmission - no history kept for v1. Findings
  // from before the required/suggestion split lack `bucket` - the API
  // and frontend both treat a missing bucket as 'required' so old
  // rejected recipes keep rendering safely until their next resubmission.
  @Prop({ type: MongooseSchema.Types.Mixed })
  qualityReview?: {
    score: number
    checkedAt: string
    findings: {
      category: string
      severity: 'critical' | 'major' | 'minor'
      bucket?: 'required' | 'suggestion'
      message: string
      field?: string
      suggestedFix?: Record<string, unknown>
    }[]
  }
```

- [ ] **Step 2: Verify the API still builds**

Run: `cd api && npx tsc --noEmit`
Expected: no new errors (this is a `Mixed` field so no callers break; `RecipesService.submitForReview` assigns `recipe.qualityReview = review` where `review: QualityReview` from Task 1 — structurally compatible since `bucket` is optional here and required in `QualityReview`, and TS allows the wider type into the narrower-typed field only if compatible; if `tsc` reports a mismatch because `QualityReview.findings[].bucket` is required but the schema field's is optional, that's fine — optional-vs-required in the assigned direction (required into optional-accepting) type-checks. If it does NOT compile, widen the schema annotation's `bucket` requirement is already optional so this direction is safe.)

- [ ] **Step 3: Commit**

```bash
git add api/src/recipes/schemas/recipe.schema.ts
git commit -m "chore: update qualityReview schema type annotation for bucket/suggestedFix"
```

---

### Task 3: Frontend — update types.ts

**Files:**
- Modify: `src/types.ts:112-124`

**Interfaces:**
- Produces: `QualityFinding { category: string; severity: 'critical'|'major'|'minor'; bucket: 'required'|'suggestion'; message: string; field?: string; suggestedFix?: Record<string, unknown> }`; `QualityReview { score: number; checkedAt: string; findings: QualityFinding[] }` (no `suggestedFields`).

- [ ] **Step 1: Update the types**

Replace `src/types.ts:112-124`:

```typescript
export interface QualityFinding {
  category: string
  severity: 'critical' | 'major' | 'minor'
  message: string
  field?: string
}

export interface QualityReview {
  score: number
  checkedAt: string
  findings: QualityFinding[]
  suggestedFields?: Record<string, unknown>
}
```

with:

```typescript
export interface QualityFinding {
  category: string
  severity: 'critical' | 'major' | 'minor'
  // Legacy pre-redesign reviews lack this field - treat as 'required'
  // wherever it's read (RecipeDetail.tsx does `f.bucket ?? 'required'`).
  bucket?: 'required' | 'suggestion'
  message: string
  field?: string
  suggestedFix?: Record<string, unknown>
}

export interface QualityReview {
  score: number
  checkedAt: string
  findings: QualityFinding[]
}
```

- [ ] **Step 2: Verify the frontend still builds**

Run: `npx tsc --noEmit -p .` (or `npm run build` if no bare tsc script exists — check `package.json`; use whichever the project's existing typecheck command is)
Expected: errors in `RecipeDetail.tsx`, `EditRecipePage.tsx`, `RecipeForm.tsx` (they still reference `review.suggestedFields` / `autoFixedFieldKeys` against the old shape) — these are fixed in Tasks 4-6. Confirm the errors are ONLY in those three files, nowhere else.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add bucket/suggestedFix to frontend QualityFinding type"
```

---

### Task 4: Frontend — RecipeDetail.tsx two-section findings UI with checkboxes

**Files:**
- Modify: `src/components/RecipeDetail.tsx:1212-1256`
- Modify: `src/i18n.ts` (add `reviewRequests`, `aiSuggestions` keys; repurpose `applyChanges` value to "Submit"/Hebrew equivalent)

**Interfaces:**
- Consumes: `QualityFinding` from Task 3 (`bucket?`, `suggestedFix?`); existing `review` (translated `QualityReview`), `recipe`, `id`, `navigate`, `canEdit` — all already in scope in `RecipeDetail.tsx` per the existing code around line 1216.
- Produces: navigation to `/recipes/${id}/edit?applySuggestions=1&findings=<comma-separated indices>` when findings are selected and Submit is clicked.

- [ ] **Step 1: Add i18n keys**

In `src/i18n.ts`, in the Hebrew block (near line 345, alongside `applyChanges`/`noIssuesFound`/`aIReviewResult`), change:

```typescript
      applyChanges: "החל תיקונים",
```
to:
```typescript
      applyChanges: "שלח",
```

and add nearby (same Hebrew block):
```typescript
      reviewRequests: "דרישות לתיקון",
      aiSuggestions: "הצעות מה-AI",
```

In the English block (near line 832), change:
```typescript
      applyChanges: "Apply changes",
```
to:
```typescript
      applyChanges: "Submit",
```

and add nearby (same English block):
```typescript
      reviewRequests: "Review requests",
      aiSuggestions: "AI suggestions",
```

- [ ] **Step 2: Add selection state above the findings block**

`RecipeDetail.tsx` is a function component with existing `useState` hooks near the top (confirm by checking imports — `useState` should already be imported since the file already has other local state like `reviewResult`). Add, near wherever `reviewResult`/other review-related state is declared (search for `const [reviewResult`):

```typescript
  const [selectedFindingIndices, setSelectedFindingIndices] = useState<Set<number>>(new Set())
```

- [ ] **Step 3: Replace the findings block**

Replace `src/components/RecipeDetail.tsx:1212-1256`:

```tsx
          {/* AI review results - either the outcome of the submission just
              made, or the recipe's last stored review (so a rejected recipe
              still shows its findings on reload, not just right after
              submitting). */}
          {canEdit && review && recipe.status !== 'published' && (
            <div className={`card p-4 mb-4 border ${review.score >= 95 ? 'border-herb/30' : 'border-red-400/20'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-cream">
                  {tx.aIReviewResult}
                </span>
                <span className={`text-lg font-bold ${review.score >= 95 ? 'text-herb' : 'text-red-400'}`}>
                  {review.score}%
                </span>
              </div>
              {review.findings.length > 0 ? (
                <ul className="space-y-1.5 mb-3">
                  {review.findings.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        f.severity === 'critical' ? 'bg-red-500/10 text-red-400'
                        : f.severity === 'major' ? 'bg-amber/10 text-amber'
                        : 'bg-tint/10 text-cream/50'
                      }`}>
                        {f.severity}
                      </span>
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-cream/40 mb-3">
                  {tx.noIssuesFound}
                </p>
              )}
              {recipe.status === 'rejected' && review.suggestedFields && (
                <button
                  type="button"
                  onClick={() => navigate(`/recipes/${id}/edit?applySuggestions=1`)}
                  className="btn-ghost text-xs"
                >
                  {tx.applyChanges}
                </button>
              )}
            </div>
          )}
```

with:

```tsx
          {/* AI review results - either the outcome of the submission just
              made, or the recipe's last stored review (so a rejected recipe
              still shows its findings on reload, not just right after
              submitting). Findings split into "required" (count toward the
              score, must be addressed) and "suggestion" (informational,
              never affect the score) - legacy reviews from before this
              split lack `bucket` and are treated as required so they still
              render safely. */}
          {canEdit && review && recipe.status !== 'published' && (() => {
            const requiredFindings = review.findings
              .map((f, i) => ({ f, i }))
              .filter(({ f }) => (f.bucket ?? 'required') === 'required')
            const suggestionFindings = review.findings
              .map((f, i) => ({ f, i }))
              .filter(({ f }) => f.bucket === 'suggestion')
            const findingBadge = (f: QualityFinding) => (
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                f.severity === 'critical' ? 'bg-red-500/10 text-red-400'
                : f.severity === 'major' ? 'bg-amber/10 text-amber'
                : 'bg-tint/10 text-cream/50'
              }`}>
                {f.severity}
              </span>
            )
            const toggleFinding = (i: number) => {
              setSelectedFindingIndices(prev => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
            const findingRow = (f: QualityFinding, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                {f.suggestedFix && (
                  <input
                    type="checkbox"
                    checked={selectedFindingIndices.has(i)}
                    onChange={() => toggleFinding(i)}
                    className="mt-0.5 shrink-0"
                  />
                )}
                {findingBadge(f)}
                <span>{f.message}</span>
              </li>
            )
            const hasSelectableFindings = review.findings.some(f => !!f.suggestedFix)
            return (
              <div className={`card p-4 mb-4 border ${review.score >= 95 ? 'border-herb/30' : 'border-red-400/20'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-cream">
                    {tx.aIReviewResult}
                  </span>
                  <span className={`text-lg font-bold ${review.score >= 95 ? 'text-herb' : 'text-red-400'}`}>
                    {review.score}%
                  </span>
                </div>
                {review.findings.length > 0 ? (
                  <>
                    {requiredFindings.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold text-cream/50 mb-1.5">{tx.reviewRequests}</p>
                        <ul className="space-y-1.5">
                          {requiredFindings.map(({ f, i }) => findingRow(f, i))}
                        </ul>
                      </div>
                    )}
                    {suggestionFindings.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold text-cream/50 mb-1.5">{tx.aiSuggestions}</p>
                        <ul className="space-y-1.5">
                          {suggestionFindings.map(({ f, i }) => findingRow(f, i))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-cream/40 mb-3">
                    {tx.noIssuesFound}
                  </p>
                )}
                {recipe.status === 'rejected' && hasSelectableFindings && (
                  <button
                    type="button"
                    onClick={() => {
                      const indices = [...selectedFindingIndices].sort((a, b) => a - b).join(',')
                      const query = indices ? `?applySuggestions=1&findings=${indices}` : '?applySuggestions=1'
                      navigate(`/recipes/${id}/edit${query}`)
                    }}
                    className="btn-ghost text-xs"
                  >
                    {tx.applyChanges}
                  </button>
                )}
              </div>
            )
          })()}
```

- [ ] **Step 4: Import `QualityFinding` type if not already imported**

Check `src/components/RecipeDetail.tsx`'s top-of-file import from `'../types'`. If `QualityFinding` isn't already in that import list, add it (used above in `findingBadge`/`findingRow` parameter types).

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit -p .` (or the project's typecheck script)
Expected: no errors in `RecipeDetail.tsx` (errors may remain in `EditRecipePage.tsx`/`RecipeForm.tsx`, fixed in Task 5).

- [ ] **Step 6: Commit**

```bash
git add src/components/RecipeDetail.tsx src/i18n.ts
git commit -m "feat: split AI review findings into required/suggestion sections with per-finding checkboxes"
```

---

### Task 5: Frontend — EditRecipePage.tsx resolves selected finding indices

**Files:**
- Modify: `src/components/EditRecipePage.tsx` (full 84-line file)

**Interfaces:**
- Consumes: `QualityFinding.suggestedFix` from Task 3; `?applySuggestions=1&findings=<indices>` query string from Task 4.
- Produces: `appliedFindingIndices: number[] | undefined` prop passed to `RecipeForm` (replaces `autoFixedFieldKeys`), consumed by Task 6.

- [ ] **Step 1: Replace the applySuggestions/reviewFindings block**

Replace `src/components/EditRecipePage.tsx:33-47`:

```tsx
  // Coming from the AI review's "Apply changes" button - layer the AI's
  // suggested field fixes on top of the current recipe before handing it to
  // the form, so the owner reviews/edits them rather than having them
  // silently auto-saved.
  const applySuggestions = searchParams.get('applySuggestions') === '1' && recipe.qualityReview?.suggestedFields
  const existing = applySuggestions ? { ...recipe, ...recipe.qualityReview!.suggestedFields } : recipe

  // Shown regardless of how the editor was reached (not just right after
  // "Apply changes") so the owner can see what the last AI review flagged
  // while they're actually fixing it, not only on the read-only recipe
  // page. autoFixedFieldKeys (which findings the AI already patched for
  // them) only makes sense right after the apply action, since those are
  // exactly the values pre-filled into the form below.
  const reviewFindings = recipe.qualityReview?.findings
  const autoFixedFieldKeys = applySuggestions ? Object.keys(recipe.qualityReview?.suggestedFields ?? {}) : undefined
```

with:

```tsx
  // Coming from the AI review's "Submit" button - the owner picked specific
  // findings to apply via checkboxes, passed here as ?findings=0,2,5 (array
  // indices into recipe.qualityReview.findings). Layer only THOSE findings'
  // suggestedFix onto the current recipe before handing it to the form, so
  // the owner reviews/edits them rather than having them silently auto-saved.
  const findingsParam = searchParams.get('findings')
  const appliedFindingIndices = searchParams.get('applySuggestions') === '1' && findingsParam
    ? findingsParam.split(',').map(Number).filter(n => Number.isInteger(n) && n >= 0)
    : undefined
  const appliedFixes = appliedFindingIndices?.reduce<Record<string, unknown>>((acc, i) => {
    const fix = recipe.qualityReview?.findings[i]?.suggestedFix
    return fix ? { ...acc, ...fix } : acc
  }, {}) ?? {}
  const existing = appliedFindingIndices ? { ...recipe, ...appliedFixes } : recipe

  // Shown regardless of how the editor was reached (not just right after
  // "Submit") so the owner can see what the last AI review flagged while
  // they're actually fixing it, not only on the read-only recipe page.
  const reviewFindings = recipe.qualityReview?.findings
```

- [ ] **Step 2: Update the RecipeForm render call**

Replace `src/components/EditRecipePage.tsx:80`:

```tsx
      <RecipeForm existing={existing} reviewFindings={reviewFindings} autoFixedFieldKeys={autoFixedFieldKeys} />
```

with:

```tsx
      <RecipeForm existing={existing} reviewFindings={reviewFindings} appliedFindingIndices={appliedFindingIndices} />
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit -p .`
Expected: errors remain only in `RecipeForm.tsx` (its props interface still expects `autoFixedFieldKeys`) — fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/components/EditRecipePage.tsx
git commit -m "feat: resolve selected AI-review finding indices to their suggested fixes in the editor"
```

---

### Task 6: Frontend — RecipeForm.tsx auto-fixed highlight by finding index

**Files:**
- Modify: `src/components/RecipeForm.tsx:29-32` (props interface), `:125` (function signature), `:544-568` (render)

**Interfaces:**
- Consumes: `appliedFindingIndices?: number[]` from Task 5.

- [ ] **Step 1: Update the props interface**

Replace `src/components/RecipeForm.tsx:31-32`:

```typescript
  reviewFindings?: QualityFinding[]
  autoFixedFieldKeys?: string[]
```

with:

```typescript
  reviewFindings?: QualityFinding[]
  appliedFindingIndices?: number[]
```

- [ ] **Step 2: Update the function signature**

Replace `src/components/RecipeForm.tsx:125`:

```typescript
export default function RecipeForm({ existing, reviewFindings, autoFixedFieldKeys }: RecipeFormProps) {
```

with:

```typescript
export default function RecipeForm({ existing, reviewFindings, appliedFindingIndices }: RecipeFormProps) {
```

- [ ] **Step 3: Update the render block**

Replace `src/components/RecipeForm.tsx:544-568`:

```tsx
        {reviewFindings && reviewFindings.length > 0 && (
          <div className="card p-4 border border-amber/20 space-y-2">
            <p className="text-sm font-semibold text-cream">
              {tx.fromTheLastAIReview}
            </p>
            <ul className="space-y-1.5">
              {reviewFindings.map((f, i) => {
                const autoFixed = !!f.field && !!autoFixedFieldKeys?.includes(f.field)
                return (
                  <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      autoFixed ? 'bg-herb/10 text-herb'
                      : f.severity === 'critical' ? 'bg-red-500/10 text-red-400'
                      : f.severity === 'major' ? 'bg-amber/10 text-amber'
                      : 'bg-tint/10 text-cream/50'
                    }`}>
                      {autoFixed ? (tx.autoFixed) : f.severity}
                    </span>
                    <span>{f.message}{autoFixed ? (tx.doubleCheckTheFixBelow) : ''}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
```

with:

```tsx
        {reviewFindings && reviewFindings.length > 0 && (
          <div className="card p-4 border border-amber/20 space-y-2">
            <p className="text-sm font-semibold text-cream">
              {tx.fromTheLastAIReview}
            </p>
            <ul className="space-y-1.5">
              {reviewFindings.map((f, i) => {
                const autoFixed = !!appliedFindingIndices?.includes(i)
                return (
                  <li key={i} className="flex items-start gap-2 text-xs text-cream/60">
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      autoFixed ? 'bg-herb/10 text-herb'
                      : f.severity === 'critical' ? 'bg-red-500/10 text-red-400'
                      : f.severity === 'major' ? 'bg-amber/10 text-amber'
                      : 'bg-tint/10 text-cream/50'
                    }`}>
                      {autoFixed ? (tx.autoFixed) : f.severity}
                    </span>
                    <span>{f.message}{autoFixed ? (tx.doubleCheckTheFixBelow) : ''}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit -p .` (or `npm run build`)
Expected: PASS, no errors anywhere.

- [ ] **Step 5: Run eslint**

Run: `npx eslint src/components/RecipeDetail.tsx src/components/EditRecipePage.tsx src/components/RecipeForm.tsx src/types.ts`
Expected: clean (no new warnings/errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/RecipeForm.tsx
git commit -m "feat: scope RecipeForm auto-fixed highlight to selected finding indices"
```

---

### Task 7: Backend full test suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd api && npx jest`
Expected: PASS, all suites green (no regressions from Tasks 1-2).

- [ ] **Step 2: Run the frontend build**

Run: `npm run build` (from repo root)
Expected: PASS, no type errors.

- [ ] **Step 3: Manual verification (dev server)**

Start the dev server (`npm run dev` for frontend, `cd api && npm run start:dev` for backend, per existing project scripts). Submit a recipe likely to get both required and suggestion findings (e.g. one with a translation gap and an unusual seasoning amount). Confirm:
- Score reflects only required-bucket findings' penalties.
- Findings render under two headed sections ("Review requests" / "AI suggestions"); legacy-shaped reviews (if any old rejected recipe exists) show everything under "Review requests" with no checkboxes.
- Checkboxes appear only next to findings that have a `suggestedFix`, default unchecked.
- Checking some boxes and clicking "Submit" navigates to the editor with only those fields pre-filled and highlighted as auto-fixed; unchecked findings with fixes are NOT pre-filled but still listed as open findings.

- [ ] **Step 4: No commit for this task (verification only)**

---

## Deployment

This repo deploys via GitHub Actions on push to `main` (see root `CLAUDE.md`). After all tasks are committed:

```bash
git push
```

Then watch CI on both the `recipes` repo and the triggered `server` repo deploy workflow (per this session's established two-stage verification pattern), and confirm the running pod's image tag matches the pushed commit SHA via `kubectl -n apps get pods -l app=recipes-api -o jsonpath='{...image}'` (and the `recipes` frontend pod equivalent).
