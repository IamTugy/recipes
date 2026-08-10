# Bulk AI Recipe Creation & Recipe Linking Design

**Goal:** Let a user generate several recipes from AI in one go, review/edit them one at a time via a persistent draft sidebar that survives refresh/device changes, and let any recipe reference another recipe as a linked ingredient (e.g. "800g of [linked dough recipe]") with save/delete/publish rules that keep links consistent.

## Global Constraints

- Bulk-generated drafts are ordinary `Recipe` documents (`status: 'draft'`) from the moment they're generated - no separate draft-only collection.
- A bulk draft is only ever removed by explicit user action (delete) - never auto-expired, never silently dropped.
- The AI-drafts sidebar is a distinct UI element from the existing app-nav `Sidebar.tsx` - do not conflate names or reuse that component.
- Linking reuses already-fetched client data (`useRecipes()`/`useMyRecipes()`) for the picker - no new search endpoint.
- A linked ingredient always resolves to "the latest revision the current viewer is allowed to see" - the same per-viewer resolution `RecipeDetail` already does for direct visits. No revision pinning, no new resolution logic.

---

## A. Data model changes

**`Recipe.pendingReview`** (new `boolean`, default `false`, schema + `RecipeInput`/DTO): `true` when a recipe is created via bulk AI generation. Cleared the first time the user performs a real `updateDraft` save on it from the editor (a normal edit-and-save, not the generation itself). Drives sidebar membership - independent of `status`. A recipe can be `pendingReview: false` and still be `status: 'draft'` (an ordinary manually-created or already-reviewed draft) - only bulk-AI output starts `true`.

**`Recipe.batchId`** (new optional `string`): shared by every recipe produced from one bulk-generate call (a `crypto.randomUUID()` per call). Lets the sidebar group/order a batch and survive refresh - the sidebar query is "my recipes where `pendingReview: true`", ordered by `batchId` then creation order, not scoped to a single browser session.

**`IngredientItem.linkedRecipeId`** (new optional `string`, both `src/types.ts` and `api/src/recipes/dto/recipe.dto.ts`'s `IngredientItemDto`): when present, this ingredient has no free-text `name`/`nameEn` - the link picker sets `linkedRecipeId` instead of typed text. `amount`/`unit` stay as normal fields (still drive scaling and display). `IngredientItemDto.name` changes from required to optional; a new class-validator rule enforces exactly one of `name` or `linkedRecipeId` is present (custom validator, since class-validator's built-ins don't express "exactly one of two fields").

---

## B. Phase A - Bulk generation + persistent draft sidebar

**Splitting one query into several recipes** (`api/src/recipes/ai-generate/recipe-ai-generate.service.ts`): before the existing two-step research→structure pipeline, add a planning step - ask Gemini whether the request describes one recipe or several, and to list them out individually if so (e.g. "chocolate cake and vanilla frosting" → 2 items; "the best focaccia" → 1 item). Run the existing per-recipe pipeline (research with search grounding, then structure into JSON) once per identified recipe, in parallel (`Promise.all`). Returns `AiGeneratedRecipe[]` instead of a single `AiGeneratedRecipe`. Same single-textarea UI on `RecipeAiGeneratePage` - no new input fields, no count picker; the model does the splitting.

**Persistence**: each generated recipe in the batch is immediately persisted through the existing `createDraft` path (`status: 'draft'`, `ownerId`, `aiGenerated: true`, `sources`), plus `pendingReview: true` and the batch's shared `batchId`. `RecipeAiGenerateController`'s response becomes the array of created recipe summaries (id + title at minimum); the frontend navigates straight into the editor for the first one.

**Sidebar** (`src/components/AiDraftsSidebar.tsx`, new): fetches the user's pending-review recipes (new `GET /recipes/pending` endpoint - a dedicated route rather than overloading `GET /recipes/mine` with a query param, since this is a materially different list with its own ordering). Rendered from `RecipeForm` (or a shared layout wrapper both `RecipeForm` and the AI-generate flow use) whenever that list has more than 1 item. Each row: thumbnail, title, a remove button (calls the existing `DELETE /recipes/:id` flow - same ownership/status guards as any other delete). Clicking a row navigates to `/recipes/:id/edit`.

**Clearing `pendingReview`**: `RecipesService.updateDraft` sets `pendingReview: false` unconditionally on every successful save - the first real edit-and-save is what "graduates" a bulk item into an ordinary My-Recipes draft, regardless of what else changed.

---

## C. Phase B - Recipe linking

**Picker** (`src/components/RecipeLinkPicker.tsx`, new): a searchable list sourced from the recipes the current user already has loaded client-side (own recipes via `useMyRecipes()`, published recipes via `useRecipes()` - same data Home's search already filters, no new backend search endpoint). Selecting a result sets that ingredient row's `linkedRecipeId` and clears `name`/`nameEn`; the row then displays the linked recipe's title (resolved client-side from the already-loaded list) instead of a text input, plus a small "unlink" affordance that clears `linkedRecipeId` and restores normal name entry.

**Cycle rejection** (`RecipesService.createDraft`/`updateDraft`): when the incoming ingredients contain any `linkedRecipeId`, walk that target recipe's own linked ingredients transitively (a simple BFS/DFS over `linkedRecipeId` edges, depth-bounded to guard against a runaway walk from bad data - e.g. cap at 50 hops). If the walk reaches back to the recipe being saved, reject with `BadRequestException` naming the cyclical link. This runs on every save that includes a link, not only when the link is newly added - cheap enough (small ingredient lists, id-only edges) and simpler than tracking "did this particular link change."

**Delete guard** (`RecipesService.remove`): before the existing checks, query for any recipe (any owner, any status, `deletedAt` unset) whose `ingredients.items.linkedRecipeId` array-contains this recipe's id (Mongo dot-path query: `{ 'ingredients.items.linkedRecipeId': id }`). If any match, reject with `ForbiddenException` - mirrors the existing "a published recipe can never be deleted" guard's style and placement.

**Publish guard** (`RecipesService.submitForReview`, alongside `missingRequiredFields`): before calling the quality service, walk the recipe's linked ingredients transitively (same walk as cycle-detection, reused as a shared private helper). If any linked recipe's `publishedRevision` is `null`, reject with `BadRequestException` naming the unpublished link - matches the existing "missing/invalid: ..." error shape used for other pre-submit validation.

**Unsaved-link guard**: the picker only ever offers already-persisted recipes (own or published), so a client can't construct a reference to something with no id. As a defensive backend check (not the primary enforcement mechanism, since it should be structurally unreachable), `createDraft`/`updateDraft` verify every `linkedRecipeId` in the payload resolves to a real, non-deleted recipe - reject with `BadRequestException` if not. This also catches the case a bulk-batch item's link target failed to generate or was removed after the link was set.

**Out of scope, explicitly noted**: `NutritionService` skips linked ingredients entirely when estimating macros (no per-serving nutrition data for "a recipe used as an ingredient") - same as it already treats unit-less whole items.

---

## D. Testing

- **Phase A**: `RecipeAiGenerateService` test for the planning/split step (mock Gemini to return N items, assert N pipeline calls); `RecipesService` tests for `pendingReview` set on bulk create and cleared on `updateDraft`; controller/service test for the `GET /recipes/pending` endpoint's filtering and ordering.
- **Phase B**: `IngredientItemDto` validation test for the name-xor-link rule; `RecipesService` tests for cycle rejection (direct A→B→A and transitive A→B→C→A), the delete guard (blocked when referenced, allowed when not), the publish guard (blocked on an unpublished direct link and an unpublished transitive link), and the unsaved-link guard (rejects a `linkedRecipeId` that doesn't resolve to a real recipe).
- Frontend: no unit test framework in this repo (established convention) - verified via `npm run build` + `eslint`, plus manual testing of the sidebar's appear/disappear threshold, the picker, and the three validation errors surfacing correctly in the editor.
