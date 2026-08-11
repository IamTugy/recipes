# Duplicate Recipe Detection + Dispute Workflow — Design

## Goal

When a user submits a recipe for review, detect whether it's a near-duplicate of an existing recipe (published, or their own other drafts) and block publishing if so, while letting the user dispute the block to the app owner.

Explicitly out of scope for this spec: grouping same-dish recipes into a browsable "item group" (e.g. all chocolate-chip-cookie recipes shown together). That's a separate follow-up spec once this ships.

## Background

`RecipesService.submitForReview` currently: checks required fields → runs `RecipeQualityService.review()` (a Gemini call scoring the recipe 0–100 against a fixed checklist) → publishes if score ≥ threshold, else sets `status: 'rejected'` with the review stored on `qualityReview`. There is no admin/moderation queue anywhere in the app today — publishing is fully automated. `OWNER_USER_ID` (single owner) is the only "admin" concept, already used for approve/deny actions on feature requests (`FeatureRequestsController`/`FeatureRequestsPage.tsx`), which this design mirrors for duplicate disputes.

## Flow

```
submitForReview(id, userId, isAdmin)
  1. missingRequiredFields check (unchanged)
  2. assertLinksPublishable (unchanged)
  3. IF recipe.duplicateCheckOverride is NOT true:
       candidates = RecipeSimilarityService.findCandidates(recipe)
       IF candidates.length > 0:
         verdict = RecipeSimilarityService.judge(recipe, candidates)  // Gemini call
         IF verdict.isDuplicate:
           status = 'rejected'
           duplicateReview = { isDuplicate: true, matchedRecipeId, matchedRecipeTitle, reason, checkedAt }
           qualityReview = undefined
           log('recipe_duplicate_blocked', { matchedRecipeId })
           return recipe   // quality review NOT run — skip straight to step 5's early return
  4. existing quality review flow (unchanged): RecipeQualityService.review() → publish or reject on score
  5. return recipe
```

Step 3 only runs the (cheap, local) candidate search on every submission. The Gemini judge call only fires when candidates exist, so most submissions pay zero extra cost or latency.

## Candidate Search (`RecipeSimilarityService`, new module `api/src/recipes/similarity/`)

Pure TypeScript, no new dependencies, no AI call. Scans all recipes except the one being submitted, scoped to: every `published` recipe, plus every draft/pending/rejected recipe owned by the same `ownerId` (a user's own in-progress duplicates count too).

For each candidate recipe, compute three scores:

1. **Ingredient+quantity match** — normalize each ingredient to `{name (lowercased, trimmed), unit, amount}` across both recipes' ingredient groups (flattened), treat as a set, compute Jaccard similarity (`|intersection| / |union|`) requiring name+unit+amount to match exactly for an item to count as shared. **Tier-1 threshold: ≥ 0.95.**
2. **Ingredient-name-only match** — same Jaccard approach but only on normalized ingredient names (ignoring unit/amount). **Tier-2 threshold: ≥ 0.85.**
3. **Title similarity** — Levenshtein-distance-based ratio (`1 - distance / max(len(a), len(b))`) on lowercased, trimmed titles (compare `title` to `title`, and `titleHe` to `titleHe` when both sides have one; take the max). **Tier-2 threshold: ≥ 0.80.**

A recipe becomes a candidate if score 1 ≥ 0.95, OR score 2 ≥ 0.85, OR score 3 ≥ 0.80. Return the list of candidate recipes (cap at 5, highest-scoring first, to keep the judge prompt bounded).

## AI Judge

Only called when `findCandidates` returns ≥ 1 candidate. Reuses `GeminiService.generateStructured` (same pattern as `RecipeQualityService`, minus the image), with a prompt containing the new recipe's title/ingredients/steps and each candidate's title/ingredients/steps (id included so the response can reference it), asking whether the new recipe is a duplicate of one of them (same dish, not meaningfully differentiated — not "both are cookies" but "this is the same recipe reworded/rescaled"). Low temperature (0), matching the quality-review call's rationale: consistent, auditable, reproducible on resubmission.

Response shape:
```ts
interface DuplicateVerdict {
  isDuplicate: boolean
  matchedRecipeId?: string
  reason: string
}
```

## Schema Changes (`api/src/recipes/schemas/recipe.schema.ts`)

```ts
@Prop({ type: Object })
duplicateReview?: {
  isDuplicate: boolean
  matchedRecipeId: string
  matchedRecipeTitle: string
  reason: string
  checkedAt: string
}

@Prop({ enum: ['none', 'pending', 'approved', 'denied'], default: 'none' })
disputeStatus!: 'none' | 'pending' | 'approved' | 'denied'

@Prop()
disputeMessage?: string

@Prop()
disputeCreatedAt?: Date

@Prop()
disputeResolvedAt?: Date

@Prop({ default: false })
duplicateCheckOverride!: boolean
```

`duplicateCheckOverride` is set `true` only when an admin approves a dispute — it permanently exempts that specific recipe document from future duplicate checks (its content was already judged a false positive; re-submitting the same content shouldn't re-trigger the same block).

## Dispute Endpoints (`RecipesController`)

- `POST /recipes/:id/dispute-duplicate` — body `{ message?: string }`. Owner-only (or admin). Requires `status === 'rejected' && duplicateReview?.isDuplicate && disputeStatus === 'none'`. Sets `disputeStatus: 'pending'`, `disputeMessage`, `disputeCreatedAt`. Logs `recipe_duplicate_disputed`.
- `GET /recipes/disputes` — admin-only (`ForbiddenException` otherwise, mirroring `FeatureRequestsController.approve`). Returns recipes with `disputeStatus: 'pending'`, each with its `duplicateReview` and the matched recipe's title/id for display.
- `POST /recipes/:id/dispute-duplicate/resolve` — body `{ approve: boolean }`. Admin-only.
  - `approve: true` → `disputeStatus: 'approved'`, `duplicateCheckOverride: true`, `status: 'draft'` (so the owner can resubmit and this time skip the duplicate check entirely, landing on the normal quality-review path). Logs `recipe_duplicate_dispute_approved`.
  - `approve: false` → `disputeStatus: 'denied'`, `disputeResolvedAt` set, status stays `rejected`. Logs `recipe_duplicate_dispute_denied`. (Editing the recipe's content already resets `status` to `'draft'` via the existing `wasRejected` branch in `updateDraft`, giving the owner a natural path to rewrite and resubmit for a fresh check.)

## Frontend

- **Duplicate banner**: in `RecipeDetail.tsx` (own-recipe view) and `EditRecipePage.tsx`, when `recipe.status === 'rejected' && recipe.duplicateReview?.isDuplicate`, show a banner above the existing quality-findings banner: the match reason, a link to `/recipes/{duplicateReview.matchedRecipeId}`, and (if `disputeStatus === 'none'`) a "Dispute" button that calls the new endpoint and shows a toast confirmation. If `disputeStatus === 'pending'`, show "Under review by the app owner" instead of the button. If `'denied'`, show the denial state (still editable/resubmittable as normal).
- **Sidebar**: no change needed — `attentionCount` (`status === 'rejected'`) already includes duplicate-blocked recipes.
- **Admin disputes panel**: new section, gated on `userId === OWNER_USER_ID` (same check as `FeatureRequestsPage`), listing pending disputes with the new recipe and matched recipe side-by-side (title, image, link to each) and Approve/Deny buttons — same interaction shape as `FeatureRequestsPage`'s deny flow (`denyingNumber`/`denyReason` state → confirm → call). Reasonable placement: a new tab/section on `SubmissionsPage.tsx` since that's already the "recent submissions" admin-adjacent view.

## Testing

- `RecipeSimilarityService`: unit tests for each threshold (95/85/80) with hand-built ingredient/title fixtures, including edge cases (empty ingredients, only one side has `titleHe`, exact self-match excluded).
- `RecipesService.submitForReview`: unit tests mocking `RecipeSimilarityService` — no candidates → quality review runs as before; candidates + AI says duplicate → status rejected, quality review skipped, `duplicateReview` populated; candidates + AI says not duplicate → falls through to quality review unchanged; `duplicateCheckOverride: true` → similarity check skipped entirely.
- Dispute endpoints: unit tests for the ownership/status guards (can't dispute twice, can't dispute a non-duplicate rejection, non-admin can't resolve), and both resolve outcomes.
