# Dish Grouping — Design

## Goal

Group recipes that are for the same specific dish (e.g. all "Caprese Salad" recipes) so the published-recipes browsing screen can show them as one collapsible group instead of cluttering the grid with near-duplicates of the same dish. Follow-up to `docs/superpowers/specs/2026-08-11-duplicate-recipe-detection-design.md`, which explicitly deferred this.

## Background

The duplicate-detection feature already blocks true near-copies at submit time. This feature is about a different, softer relationship: recipes that are genuinely different (different technique, ratios, steps) but are recognizably "the same dish" — which duplicate detection correctly does NOT flag, since it only blocks true near-copies. Grouping surfaces that relationship for browsing instead of gating anything.

Groups must be **specific**, not category-level: "Caprese Salad" is a group, "Salad" is not.

## Data Model

New collection, `api/src/recipes/schemas/dish-group.schema.ts`:

```ts
@Schema({ timestamps: true })
export class DishGroup {
  @Prop({ required: true })
  name!: string       // English canonical dish name, e.g. "Caprese Salad"

  @Prop()
  nameHe?: string      // Hebrew canonical dish name
}
```

Three new fields on `Recipe` (`api/src/recipes/schemas/recipe.schema.ts`), denormalized so the existing `GET /recipes` response needs no join or new endpoint:

```ts
@Prop({ index: true })
dishGroupId?: string

@Prop()
dishGroupName?: string

@Prop()
dishGroupNameHe?: string
```

A group is only ever *displayed* as a group when 2+ currently-published recipes share a `dishGroupId` — that count is computed live from the recipe list the frontend already has loaded, never cached, so a group that shrinks back to 1 member (recipe unpublished/hidden/deleted) naturally reverts to showing as a normal individual card. No cleanup job, no stale-count bug class.

## Assignment (Backend)

New `RecipeGroupingService` (`api/src/recipes/grouping/recipe-grouping.service.ts`), following the same constructor-injection/prompt-as-template-literal pattern as `RecipeQualityService`/`RecipeSimilarityService`.

`assignGroup(recipe)`:
1. Fetch every existing `DishGroup` (`{ id, name, nameHe }` only — cheap, no recipe data attached).
2. One Gemini call (`GeminiService.generateStructured`) with the recipe's title/titleHe/ingredients and the full list of existing group names, prompting it to either (a) return the id of an existing group if this recipe's dish is genuinely the same as one already in the list, or (b) propose a new specific dish name (with an explicit instruction and example against category-level names — "Salad" is too broad, "Caprese Salad" is correct).
3. If the response references a real id from the fetched list → set `recipe.dishGroupId` to it, and denormalize `dishGroupName`/`dishGroupNameHe` from the fetched `DishGroup` (not trusted from the AI echo, same defensive pattern as `matchedRecipeTitle` in duplicate detection).
4. Otherwise → create a new `DishGroup` from the AI's proposed name/nameHe, set `recipe.dishGroupId` to the new group's id, denormalize the name onto the recipe.
5. If the AI's returned id doesn't match any fetched group (hallucination) or the proposed name is empty, fall back to creating a new group from a sanitized version of the recipe's own title rather than leaving the recipe ungrouped silently — same "don't trust unverified AI output" posture as the duplicate feature, but grouping has no "reject" outcome to fall back to, so the safe default is "start a new group of one."

Called from `RecipesService.submitForReview`, in the existing publish-success branch (same place `recipe.status = 'published'` already gets set) — runs on every (re)publish, same cost/frequency as the quality review that already runs there.

## Display (Frontend)

**Toggle:** a new "group same dish" toggle on `Home.tsx`, persisted in the URL search params the same way `sortBy`/`activeCategory`/etc. already are.

**Grouping logic:** when the toggle is on, `Home.tsx` partitions the already-filtered/sorted recipe list: for each recipe, if its `dishGroupId` has 2+ members in the current filtered list, render one `GroupCard` at that recipe's position in the sort order (first occurrence only — later members of the same group are skipped from the grid, not duplicated); everything else renders as today's individual `RecipeCard`.

**`GroupCard`** (new component, `src/components/GroupCard.tsx`): shows the group's name (localized), member count, and a small collage of up to 4 thumbnails from the group's recipes (images already available client-side from the loaded recipe list — no new data fetch). Clicking it sets `?group=<id>` in the URL.

**Group filter:** when `?group=<id>` is present, `Home.tsx` filters the recipe list to only `r.dishGroupId === id` and renders them as normal individual `RecipeCard`s (no further collapsing needed, they're already all one group) — implemented as an additional filter alongside the existing category/tag filters, with a clear/back affordance matching the existing tag-filter chip pattern.

## Testing

- `RecipeGroupingService`: unit tests for matching an existing group (verify the exact fetched-group id gets used, not just echoed), creating a new group, and the hallucinated-id/empty-name fallback path.
- `RecipesService.submitForReview`: test that `assignGroup` is called on the publish-success path and its result (`dishGroupId`/`dishGroupName`/`dishGroupNameHe`) is persisted on the recipe.
- Frontend: no dedicated component-test harness exists in this repo (per the duplicate-detection feature's precedent) — verified via `npm run build`/lint, same as prior features.

## Out of Scope

- Merging or renaming existing groups (admin tooling) — not requested, YAGNI until groups actually drift in practice.
- Any change to duplicate detection's behavior or thresholds — fully independent feature, reads nothing from `duplicateReview`.
- A dedicated "browse by dish" directory page — explicitly declined in favor of the in-grid toggle.
