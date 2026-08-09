# Recipe Filters Reorganization Design

**Goal:** Reorganize Home's filters into always-visible basics + a collapsible "Advanced filters" section, add an AI-set kosher classification (meat/dairy/parve) with a "Dairy" filter, give every filter a tap-to-open tooltip, and sync all filters + search to the URL so shared links reproduce the exact view.

## Global Constraints

- `kosherType` is optional, never blocks submission (not added to the deterministic required-field gate).
- Existing "Dairy-free" dietary filter is kept as-is (unrelated concept - allergy/health framing vs kosher framing). Only "Dairy" and implicitly "Meat" are exposed as kosher filter chips; "Parve" is stored data, not a filter chip.
- Tooltips open via tap/click (an (i) icon + popover), not hover-only - must work identically on mobile and desktop.
- URL sync applies to the Home page only.

## 1. Data model

Add `kosherType?: 'meat' | 'dairy' | 'parve'` to:
- `api/src/recipes/schemas/recipe.schema.ts` (`@Prop()` optional string union)
- `api/src/recipes/dto/recipe.dto.ts` (`@IsIn(['meat','dairy','parve']) @IsOptional()`)
- `src/types.ts` Recipe interface

Set by AI at creation time:
- `api/src/recipes/ai-generate/recipe-ai-generate.service.ts` prompt gains an instruction to classify kosherType from the recipe's ingredients (dairy = contains dairy and no meat/poultry/fish of any kind; meat = contains any meat/poultry/fish; parve = neither).
- `api/src/recipes/import/recipe-import.service.ts` same instruction added to its extraction prompt.
- `api/src/recipes/quality/recipe-quality.service.ts` review prompt gains a check: does kosherType (if set) match what the ingredients actually contain - a mismatch is a `major` finding, with a `suggestedFields.kosherType` correction.

Owner-editable in `RecipeForm.tsx`: a 3-way select (Meat/Dairy/Parve/unset) next to Category/Difficulty, with the same tooltip pattern as the filters.

## 2. Filter definitions - single source of truth

New `src/lib/filterDefinitions.ts`:

```ts
export type FilterKind = 'difficulty' | 'dietary' | 'kosher'
export interface FilterDef {
  key: string
  kind: FilterKind
  label: { he: string; en: string }
  tooltip: { he: string; en: string }
}
export const FILTER_DEFINITIONS: FilterDef[]
```

Covers difficulty (easy/medium/hard), the existing dietary filters (vegetarian/vegan/gluten-free/dairy-free) migrated from `Home.tsx`'s inline `dietaryFilters` array into this shared shape, and the new kosher filters (Meat, Dairy).

`Home.tsx` imports this to render chips + tooltip popovers. Category chips stay driven by the existing `categories`/`categoryEmoji` (unrelated - category is a single-select basic filter, not part of this multi-select advanced set).

Backend prompts (`recipe-ai-generate`, `recipe-import`, `recipe-quality`) get a hand-maintained text block describing the same filter semantics (tooltip text, effectively) inlined into their prompt strings - no runtime import, since `api/` and `src/` are separate TS projects with no shared module boundary. A code comment in each prompt constant points back to `filterDefinitions.ts` as the source of truth to keep them from drifting silently.

## 3. Home page layout

- **Always visible** (unchanged): search box, category chips, Favorites toggle.
- **New "Advanced filters" section**: a toggle button below the category row, showing "Advanced filters" with a badge for the active count when collapsed (e.g. "Advanced filters (2)"). Expands to reveal three labeled sub-sections:
  - **Difficulty** - existing single-select chips (easy/medium/hard).
  - **Dietary** - existing multi-select chips (vegetarian/vegan/gluten-free/dairy-free).
  - **Kosher** - new multi-select-of-one chips (Meat/Dairy) - selecting one filters `recipe.kosherType === that value`.
- Each chip in the advanced section gets a small (i) icon; tapping it opens a `Popover` (reuse `@base-ui/react` primitives already used elsewhere, e.g. `Dialog`/`Select` patterns in the codebase) anchored to the icon, showing that filter's tooltip text. Dismisses on outside-click/tap.

## 4. URL sync

`Home.tsx` already reads `?tag=` once on mount. Replace/extend that with full two-way binding via `useSearchParams`:

- Params: `q` (search text), `category`, `diff`, `diet` (comma-separated for multi-select dietary keys), `kosher`, `sort`, `fav` (favorites-only, `1`/absent).
- On mount: parse present params into initial filter state (replaces the current one-shot `?tag=` consumption - `tag` becomes an alias for `q` for backward compatibility with existing share links).
- On every filter/search/sort change: `setSearchParams(next, { replace: true })` so typing in the search box doesn't spam browser history - only real navigation should be back-button-able.
- Absent/default-value filters are omitted from the URL (clean URLs when nothing's active).

## 5. Testing

- `filterDefinitions.ts`: unit test that every entry has both `he` and `en` label + tooltip non-empty.
- URL sync: round-trip test (set every filter → read resulting URL → parse it back → same filter state).
- Backend: DTO validation accepts the three kosherType values and rejects others; recipe-ai-generate/recipe-import service tests assert the prompt includes kosherType instructions and that a returned `kosherType` passes through to the created draft; recipe-quality service test for the meat/dairy mismatch finding.
- `RecipeForm`: kosherType select renders and saves correctly, defaults to unset.
