# Cook Mode Redesign — Phase E: Automatic Cooked-Counter + Dock Polish — Design

## Goal

Automatically count a recipe as cooked each time a guided cook session genuinely finishes, gated by a per-user cooldown so a rapid restart-and-refinish loop can't inflate the count. Delete the old manual "mark cooked" toggle infrastructure entirely (dead since Phase A). Alongside this, apply five small UI adjustments to the "Start cooking" button and the cook dock that came up during this phase's design discussion. Fifth of several phases redesigning cook mode (A-D already shipped).

## Background

`api/src/cook-log/` (schema/service/controller) exists today as a boolean per-`(userId, recipeId)` marker: a unique compound index physically prevents more than one row per user+recipe, and `countsById` aggregates rows per `recipeId` — today that means "distinct users who've marked this cooked," which is what feeds `recipe.cookCount` (`src/types.ts:92`) everywhere it's displayed. The frontend hook that used to call this (`src/hooks/useCookedRecipes.ts`, POST/DELETE `/cooked/:id`) has zero callers anywhere in the app or MCP server — Phase A deleted the "Made it" button that used it and never rewired it to anything else.

Phase C's `CookSessionsService.finishSession` (`api/src/cook-sessions/cook-sessions.service.ts`) already fires exactly once per genuinely completed cook, for signed-in users only, and already writes a permanent Mongo `CookSession` record with `userId`/`recipeId` at hand — the natural single trigger point for counting a cook.

Recipes already have `prepTime`/`cookTime` (`src/types.ts:71-72`, both `number`, minutes).

`RecipeDetail.tsx`'s "Start cooking" button (Phase A) currently shows `recipe.cookCount` inline as `(N)`, and is sized to its content rather than stretching full-width on mobile. `CookDock.tsx` (Phase B) always mounts collapsed; its expanded header has a collapse-chevron button on the left and an icon-only ✕ stop button on the right.

## Approach — Counter

**Schema change** (`api/src/cook-log/schemas/cook-log.schema.ts`): drop the unique `(userId, recipeId)` index; add `cookedAt: Date`. The collection becomes an append-only log — one row per counted cook event, not a boolean marker. This is a breaking schema change (existing rows, if any, remain valid single-event rows; the unique index simply no longer applies going forward).

**Trigger:** `CookSessionsService.finishSession` calls a new `CookLogService.recordCook(userId, recipeId)` right after the `CookSession` Mongo document write, inside the same method — no new integration surface, and it fires only when a cook has genuinely and fully finished (the existing method's own semantics, untouched).

**Cooldown:** `recordCook` looks up the calling user's own most recent `CookLog` row for that `recipeId`. If it exists and is younger than `Math.max((recipe.prepTime ?? 0) + (recipe.cookTime ?? 0), 10)` minutes, `recordCook` silently no-ops — no new row is inserted, and critically, this never affects `finishSession`'s own success (the `CookSession` timeline record is written either way; only the counter increment is gated). Cooldown is scoped per-user, not global — two different users finishing back-to-back both count independently.

**Counts exposed (both, per your decision):**
- `CookLogService.countsById(recipeIds: string[]): Promise<Map<string, number>>` — total rows per recipe across all users. Same method name/shape as today, but now counts events, not distinct users — every existing call site in `recipes.service.ts` (populating `recipe.cookCount`) keeps working unchanged, just with the new (more literal) meaning.
- `CookLogService.userCountsById(userId: string, recipeIds: string[]): Promise<Map<string, number>>` — new method, rows scoped to one user. Feeds a new `recipe.userCookCount?: number` field, populated only for the signed-in viewer, only where `recipes.service.ts` already has a `userId` in scope (recipe detail fetch; list/card endpoints that don't currently take a viewer identity don't gain this field).

**Deletions:** `api/src/cook-log/cook-log.controller.ts` (the `/cooked` REST surface: `GET`/`POST`/`DELETE`), `src/hooks/useCookedRecipes.ts`. `CookLogService`/`CookLogModule`/the schema stay (still consumed internally by `recipes.service.ts` and now by `CookSessionsService`), just lose their controller and their old `markCooked`/`unmarkCooked`/`listIds` methods (nothing calls them once the controller's gone).

**Error handling:** `recordCook` never throws — matches this module's and Phase C's established "never block the feature it's attached to" convention. A failure here must never prevent `finishSession` from completing or from returning success to the caller.

## Approach — Dock/Button Polish

1. **"Start cooking" button:** remove the `{!!recipe.cookCount && <span>({recipe.cookCount})</span>}` badge entirely — the count still exists (`recipe.cookCount`/`recipe.userCookCount`) but is no longer shown inside this button (out of scope here whether/where else it might be shown — not requested, not built). Button becomes `w-full` below the `sm:` breakpoint (stretching to the padded width of its container, matching how other mobile-first full-width controls in this app behave), reverting to its natural content-sized width at `sm:` and up.
2. **Opens expanded by default:** `openWizard()` (`RecipeDetail.tsx`) signals `CookDock` to mount already expanded (90dvh) rather than collapsed. Implementation: a new boolean prop, e.g. `startExpanded`, read once via `useState(startExpanded)` for `CookDock`'s internal `expanded` state's initial value (matches the existing pattern already used for `screen`'s own lazy initializer). Resuming a session via cross-device discovery (Phase D) or the 5s poll does NOT force-expand an already-collapsed dock — this only applies to the moment a *user* clicks "Start cooking" fresh.
3. **Drawer handle repositioned:** a new full-width, centered strip at the very top of the expanded sheet (above today's header row) holds just the collapse chevron, now purely a visual/tap "drag handle." The existing header row below it drops the chevron from its left slot; that slot is now taken by the step label (moved from center), with the "Stop cooking" control (see next point) on the right, same as the ✕ was.
4. **"Stop cooking" replaces the ✕:** a labeled text button (new i18n key `tx.stopCooking` — he: "הפסק בישול", en: "Stop cooking") in the header row's right slot, same `onStop` handler the ✕ already calls. No icon-only control for this action anymore.

## Data Flow

1. User finishes the last step in `CookDock` → `advanceWizardOrFinish()` (`RecipeDetail.tsx`) → `finishCookSession(cookSessionId, getToken)` (frontend, unchanged) → `POST /cook-sessions/:sessionId/finish` → `CookSessionsService.finishSession` writes the `CookSession` Mongo doc, then calls `this.cookLogService.recordCook(session.userId, session.recipeId)` before deleting the Redis keys.
2. `recordCook` looks up the recipe's `prepTime`/`cookTime` itself via a new `Recipe` Mongoose model injection into `CookLogModule`/`CookLogService` (this module has no recipe dependency today — this is a new one, added in this phase, rather than having `CookSessionsService` fetch the recipe and pass times through, keeping the cooldown-lookup logic self-contained in the module that owns it). It then computes the cooldown window, checks the user's most recent row for this recipe, inserts a new timestamped row if outside the window, no-ops otherwise.
3. Next time this recipe is fetched (list, card, or detail), `recipes.service.ts`'s existing `countsById` call now returns event-based counts; a new `userCountsById` call (detail fetch only) populates `userCookCount` for the signed-in viewer.

## Testing

Backend: unit tests for `recordCook` (first-ever cook inserts; a second call inside the cooldown window no-ops; a call outside the window inserts a second row; cooldown floor applies when `prepTime`/`cookTime` are both unset), `countsById`/`userCountsById` aggregation correctness, and confirmation `finishSession` still succeeds and still writes the `CookSession` doc even when `recordCook` would no-op (cooldown) or hypothetically throws (defensive - matches the "never block" convention). Frontend: no test framework in this codebase (established precedent) — `npm run build` + eslint clean is the bar for the button/dock changes.

## Out of Scope

- Anything about *when* a session is allowed to start (Phase F's cook-conflict warning is unrelated — finishing always succeeds and is never blocked by this phase).
- Showing `cookCount`/`userCookCount` anywhere new (e.g. recipe cards, a "people who cooked this" list) beyond the existing single badge location, which this phase is removing content from, not adding to.
- Any change to `CookLogModule`'s export surface beyond what `CookSessionsModule` needs to call `recordCook`.
