# Recipe Editor/Detail UX Overhaul Design

**Goal:** Polish the revision history UI, rework the edit/publish flow with confirmations, consolidate image handling into one reusable component with a lightweight partial-save, make auto-translate smarter about when it should re-run, and add a real undo/redo stack to the recipe editor.

## Global Constraints

- All changes are frontend-first; only C (image save) and possibly none of the others need a new backend endpoint.
- Undo/redo is in-memory, scoped to the current edit session - not persisted across reloads.
- No new dependency added unless something here is genuinely unavailable in what's already installed (`@base-ui/react`, `@dnd-kit/*`).

---

## A. Revision history polish (RecipeDetail.tsx)

- Each revision list entry shows a status pill: **Live** (currentRevision === publishedRevision and this is that revision), **Rejected** (this revision was submitted and its `qualityReview` exists with score < threshold, matched via timestamp/order - in practice: the revision's own submission outcome, sourced from `recipe.qualityReview` when `recipe.status === 'rejected'` and this is the current revision, since past qualityReview data per older revision isn't stored - only the live one), or plain (draft, never submitted).
- Clicking an entry sets `viewingRevision` (existing state) - verify this already works; fix if the click handler isn't wired.
- The `border-amber` (or similar) highlight class applies only to the list entry matching `viewingRevision?.id` (or the live entry when `viewingRevision` is null), not every entry.
- "Back to current version" button only renders when `viewingRevision !== null` (hidden when already viewing the live/latest one) - likely already correct; verify.
- Toggle button (`revisionsOpen`) icon: chevron-down when collapsed, chevron-up when expanded (rotate via CSS, matching the existing Advanced-filters chevron pattern from Home.tsx).
- Small `text-cream/30 text-[11px]` note next to the "My Notes" section heading: "Private - only visible to you" / "פרטי - גלוי רק לך".

## B. Edit/Publish flow (RecipeDetail.tsx)

- Edit button repositioned: `absolute` over the hero image's top row, opposite side from the existing Back/Breadcrumbs control (RTL-aware via `lang`).
- When `canEdit && recipe.currentRevision !== recipe.publishedRevision` (unpublished changes exist) and not currently viewing a non-latest revision, a "Publish" button renders next to Edit.
- Copy: "Edit" (was "Edit recipe"/"ערוך מתכון" - shorten to "Edit"/"עריכה"), "Publish" (was "Submit for review"/"שלח לבדיקה" - now "פרסם").
- Publish click -> `ConfirmDialog` (existing component, used elsewhere per codebase convention) - "Publish this recipe for AI review?" - confirm calls the existing `handleSubmitForReview`.
- Leaving edit mode (RecipeForm.tsx's own Back/navigate-away action) with unsaved changes -> `ConfirmDialog` - "Discard unsaved changes?". Dirty-checking: compare current form state to the initial `prefill`/`existing` snapshot (structural equality), or simpler - track a `dirty` boolean flipped true on first change since mount/last save.

## C. Unified image field component

New `src/components/EditableImageField.tsx` replacing `PhotoUploadField.tsx` and `StepPhotoField.tsx`. Props: `image`, `onChange(url)`, `uploadRecipeId`, `lang`, `recipeId?` (present only when editing an existing, already-saved recipe - enables the partial-save path), `onError?`.

Clicking the thumbnail opens a modal (new, built from existing `ImageCropModal` + `EnhanceImageModal` internals combined) offering: crop (existing `ImageCropModal` flow), AI-enhance (existing `EnhanceImageModal` flow, already cancelable/undoable), and a **"Save image"** button.

"Save image": uploads the current image (if changed) and calls a new endpoint `PATCH /api/recipes/:id/image` with `{ image: string }` - a minimal DTO (`@IsString() @MinLength(1) image`), updates just that field on the live document (no revision bump, no validation of the rest of the recipe, no quality review triggered) so a photo fix doesn't get blocked by unrelated invalid fields elsewhere in the form. Only shown when `recipeId` is provided (i.e. editing an existing recipe, not the new-recipe flow, where there's nothing to partially save yet).

`RecipeForm.tsx` swaps its `PhotoUploadField`/`StepPhotoField` usages for `EditableImageField`. The two old components are deleted once nothing references them.

## D. Smarter auto-translate

Remove the `scheduleAutoTranslate` debounce-timer mechanism. Add a `touchedFields: Set<string>` ref (keyed the same way `regenerating`/`translateTimers` already are, e.g. `` `ing-${item._key}` ``) that's marked for a field the moment the user types into it directly (`onChange` for that specific field sets touched; auto-fill/AI-fill paths never set it).

New `onBlur` handler per translatable field pair (title/titleHe, description/descriptionEn, every ingredient name/nameEn, every step instruction/instructionEn, tips/tipsEn):
- If the field being blurred is empty -> no-op (nothing to translate from).
- If its counterpart is empty -> translate this field into the counterpart.
- If the counterpart is non-empty AND the counterpart's key is NOT in `touchedFields` -> re-translate anyway (keeps an untouched auto-filled counterpart in sync).
- If the counterpart's key IS in `touchedFields` -> no-op (respects the user's manual edit, never overwrites it).

## E. Undo/redo

New `src/hooks/useUndoableState.ts`: wraps a single state value (the whole editable recipe draft object: title, ingredients, steps, everything except transient UI state like `submitting`) in an undo/redo stack.

```ts
function useUndoableState<T>(initial: T): {
  state: T
  set: (next: T | ((prev: T) => T), commit?: boolean) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}
```

- `set(..., commit=true)` (default) pushes the *previous* state onto the undo stack and clears the redo stack - used for "completed" changes: a field's `onBlur` (not every keystroke), add/remove/reorder ingredient or step, image change, translate-regenerate result.
- `set(..., commit=false)` updates the live value without pushing a history entry - used for the actual keystrokes between focus and blur, so typing doesn't create an undo entry per character (native input-level undo already handles that).
- `undo`/`redo` are standard stack pops/pushes.
- `RecipeForm.tsx` replaces its ~25 individual `useState` calls for editable fields with one `useUndoableState` call over a single draft object, OR (lower-risk alternative) keeps the individual `useState`s and the hook instead snapshots the *whole set* of them via a small manual serialize/deserialize pair - **decision: consolidate into one draft object**, since patching 25 separate undo-aware setters is far more error-prone than one object with one undo stack, and every field already flows into a single `RecipeInput` object at submit time anyway (existing `handleSubmit` builds exactly this shape) - low risk, matches an already-existing target shape.
- UI: two icon buttons (undo/redo, disabled per `canUndo`/`canRedo`) at the top of the form, plus `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` keyboard shortcuts (skip when focus is inside a text input that has its own pending native undo state - simplest correct rule: only handle the shortcut at the `keydown` level when `document.activeElement` is not a text-editable element, letting the browser's native per-field undo take priority while a field is actively focused, and the app-level stack take over once focus leaves it).

## Also (unrelated small copy fix)

The "AI generated" tooltip/badge copy changes: drop "generated" language entirely in favor of "co-authored" - the recipe was AI-drafted from real sources, then reviewed/approved and can be edited by the user, so it's not "invented from scratch" framing alone. New copy (both RecipeDetail and RecipeForm banners):

- EN: "This recipe was co-authored with AI - it started from real recipes AI found online, then was reviewed and approved by the person who posted it, who can edit any part of it. See the sources below for what it was inspired by."
- HE: equivalent in Hebrew.

Label text itself changes from "AI generated"/"נוצר בעזרת AI" to "AI co-authored"/"נוצר בשיתוף AI" (or similar - "written with AI help" framing, not "generated by AI").

## Testing

- Backend: new `PATCH /recipes/:id/image` endpoint - controller + service tests (auth/ownership check, updates only the image field, no revision bump, no validation of unrelated fields).
- Frontend: no existing unit test framework (confirmed earlier this session) - verified via `tsc -b`, `eslint`, `vite build`, and manual testing of undo/redo, blur-translate, image modal, and the two confirm dialogs.
