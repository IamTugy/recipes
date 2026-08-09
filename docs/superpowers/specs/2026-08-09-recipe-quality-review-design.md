# AI Recipe Quality Review Design

**Goal:** Replace manual admin approve/reject with an automated two-stage gate on the submission flow: a deterministic required-field check, then an AI quality review that must score ≥95 to publish.

## Global Constraints

- No AI call happens unless the deterministic check already passed (cost control).
- The AI never edits/replaces the recipe's image - it only flags problems with it. Suggested fixes are text/numeric fields only.
- `aiGenerated` provenance lock (existing) is unaffected - untouched by this feature.
- Score is computed deterministically from AI-returned findings (fixed point deductions per severity), not freehanded by the model as a raw percentage.

## 1. Submission flow (backend)

`submitForReview` becomes synchronous, single round-trip:

1. Run `missingRequiredFields()` (extended - see §2). Fail -> `400`, no AI call.
2. Pass -> call `RecipeQualityService.review(recipe)`, which prompts Gemini with the recipe's text + photo and returns structured findings + score.
3. Score >= 95 -> publish immediately: `status: 'published'`, `publishedRevision = currentRevision` (same effect as today's `approveSubmission`).
4. Score < 95 -> `status: 'rejected'`, `qualityReview` stored on the recipe with findings + suggested fixes. User stays on the recipe page and sees the result inline.

`pending_review` is no longer a resting state - a recipe is never waiting on a human. The status is kept in the enum for backward compatibility with old data/tests but the new flow never sets it.

## 2. Deterministic required-field check (extended)

Existing `missingRequiredFields()` checks presence of top-level fields only. Extend it to also require:

- Every ingredient item has non-empty `name`, non-empty `unit`, and `amount > 0` (or explicitly zero is allowed for "to taste" style entries where `amount` is 0 and `unit` is non-empty - keep existing semantics, just require the item isn't fully blank).
- Every step group has at least one item with a non-empty `instruction`.

Still zero AI calls, zero cost, synchronous.

## 3. AI review (new)

New `GeminiService.generateStructuredWithImage<T>(prompt, imageBase64, mimeType)` - extends the existing text-only `generateStructured` to also accept an inline image part, mirroring the `editImage` method's multimodal request shape but requesting JSON output instead of an image.

New `RecipeQualityService.review(recipe): Promise<QualityReview>`:

- Fetches the recipe's image (guarded the same way `uploads.service.enhancePhoto` guards its source fetch - only our own R2-hosted URLs).
- Builds a prompt covering: quantities sanity, image quality/matches the dish, no missing steps, timers filled where sensible, ingredient list matches what's used in steps, translation quality (he/en), no inappropriate/18+ content, no duplicate ingredients, servings-vs-quantities sanity, category/difficulty match content, prep/cook time plausibility, step<->ingredient cross-reference.
- Prompt instructs Gemini to return `{ findings: [{ category, severity: 'critical'|'major'|'minor', message, field? }], suggestedFields?: {...} }` - the model does NOT compute a score itself.
- Score computed server-side: `100 - sum(critical=25, major=10, minor=3)`, floored at 0.

## 4. Storage

New `qualityReview` field on `RecipeSchema`:

```ts
@Prop({ type: MongooseSchema.Types.Mixed })
qualityReview?: {
  score: number
  checkedAt: string
  findings: { category: string; severity: 'critical' | 'major' | 'minor'; message: string; field?: string }[]
  suggestedFields?: Record<string, unknown>
}
```

Overwritten on each resubmission (no history needed for v1).

## 5. UI

- **Recipe page** (`RecipeDetail.tsx`, viewed by the owner): after Submit, an inline results panel appears - score (large, colored by pass/fail), findings list grouped by severity, and:
  - **Rejected**: "Apply changes" button -> navigates to the edit page, passing `qualityReview.suggestedFields` through the same `importedDraft`-shaped prefill mechanism `RecipeAiGeneratePage` already uses to hand `RecipeForm` a draft.
  - **Published**: a success state, no button needed (recipe is now live).
- **New page, `/submissions`** (all signed-in users, not gated to admin): a feed of recent AI review results across every user's recipes - title, owner, score, pass/fail, timestamp, expandable findings. This is the "track all in-progress publish" page - since there's no resting pending state anymore, this is a public audit trail of everyone's submit attempts (rejected = still in progress toward publish; published = completed).
- **`AdminSubmissionsPage`**: repurposed into the same feed component as `/submissions` (or removed entirely in favor of the new shared page, gated open to everyone) - no more manual approve/reject buttons. `approveSubmission`/`rejectSubmission` backend endpoints and `listPendingSubmissions` are removed since nothing calls them anymore.

## 6. Testing

- Backend: extended `missingRequiredFields` unit tests (per-item ingredient/step validation), `RecipeQualityService` scoring math (unit tests with mocked Gemini responses covering 0/1/multiple findings of each severity, clamped at 0), `GeminiService.generateStructuredWithImage` (mocked SDK call), `RecipesService.submitForReview` branch coverage (required-field failure / AI pass -> published / AI fail -> rejected), controller test for the new submissions-feed endpoint.
- Frontend: results panel renders findings/score correctly for both outcomes, "Apply changes" navigates with the right prefill shape, new `/submissions` page renders the feed and handles empty state.
