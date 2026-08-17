# AI Quality Review: Required vs Suggestion Buckets — Design

## Goal

Split the AI submission-review's findings into two categories the owner sees separately: **review requests** (mandatory — affect the score/publish threshold) and **AI suggestions** (optional — never affect the score). Let the owner pick, via checkboxes, exactly which AI-proposed fixes get pre-filled into the editor, instead of the current "Apply changes" blindly pre-filling every suggested field at once.

## Background

`RecipeQualityService.review()` returns `{score, findings: [{category, severity, message, field?}], suggestedFields?: Record<string, unknown>}`. `computeScore` deducts fixed points per finding (critical=25, major=10, minor=3) regardless of what the finding is about, and `RecipesService.submitForReview` rejects below a 95-point threshold. `suggestedFields` is a flat map of whole-field replacements unrelated to any individual finding. `RecipeDetail.tsx` shows all findings in one list with a severity badge and, if `suggestedFields` exists, a single "Apply changes" button that navigates straight to `/recipes/:id/edit?applySuggestions=1`, pre-filling every suggested field at once with no choice involved.

The owner wants creative freedom over their own ingredients/description — a stylistic nudge (their example: MSG quantity) shouldn't block publishing or get silently force-applied the same way a real inconsistency or translation error does.

## Approach

**Per-finding bucket, not a severity-tier rule.** The Gemini review prompt is rewritten so each finding carries its own `bucket: 'required' | 'suggestion'` — `required` for anything threatening accuracy, safety, translation quality, or internal consistency; `suggestion` for stylistic/preference nudges that don't need fixing to publish. This is orthogonal to `severity` (a `bucket: 'suggestion'` finding can still be flagged `major` for how noticeable it is, it just won't cost score points). `computeScore` only sums penalties for `bucket === 'required'` findings.

**Per-finding fix, not a flat field blob.** The prompt's `suggestedFields` output is replaced with a per-finding `suggestedFix?: Record<string, unknown>` (same "full field replacement" semantics as today — if it touches `ingredients`, it's the entire corrected array, not a diff). The prompt explicitly instructs: if multiple findings touch the same field, only one of them carries the `suggestedFix` for it, so two findings can never silently overwrite each other's proposed value.

**Selection UI.** `RecipeDetail.tsx`'s findings card splits into two lists — "Review requests" and "AI suggestions" — each finding keeping its severity badge. Any finding with a `suggestedFix` gets a checkbox, unchecked by default (opt-in, not opt-out — matches wanting deliberate control even over mandatory findings' proposed wording). The single "Apply changes" button becomes "Submit"; clicking it collects the checked findings' array indices and navigates to `/recipes/:id/edit?applySuggestions=1&findings=<comma-separated indices>` — extending, not replacing, today's query-flag convention, so it stays bookmarkable/refresh-safe (no React Router navigation state).

**Applying the selection.** `EditRecipePage.tsx` reads the `findings` query param, looks up those indices in `recipe.qualityReview.findings`, and merges only their `suggestedFix` values into the form's initial values (instead of spreading the old flat `suggestedFields` blob). `RecipeForm.tsx`'s "auto-fixed" highlighting switches from field-name matching (`autoFixedFieldKeys: string[]`) to finding-index matching (`appliedFindingIndices: number[]`), so the highlight stays scoped to the specific findings the owner actually selected, not "any finding that happens to touch this field."

## Data Flow

1. `RecipeQualityService.review()` → Gemini returns findings each with `bucket` + optional `suggestedFix`; `computeScore` sums only `required`-bucket penalties.
2. `RecipesService.submitForReview` unchanged otherwise — still gates publish on the same 95-point threshold, now computed from required-only findings.
3. `RecipeDetail.tsx` renders the two-section findings list with checkboxes, "Submit" button navigates with selected indices in the query string.
4. `EditRecipePage.tsx` resolves those indices against the stored `qualityReview.findings`, merges their `suggestedFix`es, passes the merged patch + `appliedFindingIndices` to `RecipeForm`.
5. `RecipeForm.tsx` shows the same "from the last AI review" findings list (unchanged location) with auto-fixed highlighting keyed by finding index instead of field name.

## Schema / Types

`Recipe.qualityReview` (Mongoose `Mixed`, no migration needed) and the frontend `QualityFinding`/`QualityReview` types both gain `bucket: 'required' | 'suggestion'` and per-finding `suggestedFix?: Record<string, unknown>`, and lose the top-level `suggestedFields`. Existing rejected recipes reviewed under the old shape simply show every finding under "Review requests" with no checkboxes (safe default, no crash) until their next resubmission produces a review in the new shape — matching the field's existing "no history, overwritten on each resubmission" behavior already documented in the schema comment.

## Testing

Backend: `RecipeQualityService.computeScore` — a suggestion-bucket finding at any severity contributes 0 to the deduction; a required-bucket finding still deducts per its severity as today. Frontend: no test framework (established precedent) — `npm run build` + eslint clean is the bar. Manual: submit a recipe that gets both required and suggestion findings, confirm the score reflects required-only; check some suggestion boxes and some required boxes, click Submit, confirm only those specific fields land pre-filled in the editor and are highlighted as auto-fixed; leave a required finding's checkbox unchecked, confirm it's NOT pre-filled but still visible as an open finding.

## Out of Scope

- Any change to the duplicate-check/dispute flow (separate from quality review).
- Persisting review history across resubmissions (still overwritten each time, per existing behavior).
- A dedicated migration for legacy `qualityReview` documents — they degrade gracefully as described above.
- Any change to the 95-point publish threshold itself, or to per-severity penalty amounts.
