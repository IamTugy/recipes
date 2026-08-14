# Cook Mode Redesign — Phase F: Cook-Conflict Warning — Design

## Goal

Warn a user when starting a cook on a different recipe while one is already active elsewhere, and let them either cancel or proceed (abandoning the old session). On the recipe currently being cooked, show real visual feedback ("Cooking...") instead of a silently-inert button. Sixth of several phases redesigning cook mode (A-E already shipped).

## Background

`api/src/cook-sessions/` (Phase C) has a live Redis session and, since Phase D, a per-recipe reverse index (`cook-session-active:{userId}:{recipeId}` → `sessionId`) that answers "is there an active session for THIS recipe, for this user." There is no way today to answer "does this user have an active session on ANY recipe" from a recipe page that isn't the one being cooked. `RecipeDetail.tsx`'s "Start cooking" button (the only place a cook-start action exists in this app — confirmed, nothing else renders it) always stays fully clickable; `openWizard()` already no-ops harmlessly if a session is already active for the currently-viewed recipe, but gives zero visual feedback when that happens.

## Approach

Add one new per-user Redis pointer, `cook-session-current:{userId}` → `{ sessionId, recipeId, recipeTitle }` (same TTL/refresh semantics as the existing keys), maintained alongside the per-recipe index: set on `startSession`, deleted on `finishSession`/`abandonSession`. A single pointer, not a scan over the per-recipe keys — a user realistically cooks one thing at a time, and Redis `SCAN` over a wildcard pattern is worth avoiding by design rather than reaching for later. `startSession` looks up the recipe's title via the `Recipe` model (mirroring Phase E's `CookLogService` pattern of injecting `Recipe` for its own needs) so the pointer carries everything a warning popup needs without a second round-trip.

New endpoint: `GET /cook-sessions/current` → the pointer's contents (`{ sessionId, recipeId, recipeTitle }`) or `null`. Called lazily — only at the moment "Start cooking" is clicked, never on page load (no proactive indicator, per your decision — this phase's only requirement is the popup-on-click).

**Frontend flow**, all inside `openWizard()` in `RecipeDetail.tsx`:
1. If `cookSessionActive` is already true for the currently-viewed recipe: unreachable via click now that the button is disabled in that state (see below) — the existing no-op guard stays as defense in depth.
2. Otherwise, call `GET /cook-sessions/current` before doing anything else. If it returns a session for a *different* `recipeId`, show the existing `ConfirmDialog` component (already used twice elsewhere in this file — reused, not reinvented) with the message "You're already cooking **[recipeTitle]**. Starting this will abandon that session unfinished. Continue?". Confirming calls `abandonCookSession` on the old session, then proceeds with today's normal start flow on the current recipe. Cancelling does nothing further.
3. If it returns `null`, or a session for *this* same recipe (a race/stale-state edge case, not a real conflict), proceed straight to starting — no popup.

**Button state:** "Start cooking" becomes `disabled` and shows a new `tx.cooking` label ("מבשל..." / "Cooking...") instead of `tx.startCooking` whenever `cookSessionActive` is true for the currently-viewed recipe.

## Data Flow

1. `openWizard()` → (if not already cooking this recipe) `GET /cook-sessions/current` → popup only if the response names a different recipe → on confirm, `DELETE /cook-sessions/:sessionId` (existing abandon endpoint) for the old session, then the existing `POST /cook-sessions/:recipeId` start flow, unchanged.
2. `CookSessionsService.startSession` additionally writes `cook-session-current:{userId}` alongside its existing writes (main session key + per-recipe index).
3. `finishSession`/`abandonSession` additionally delete `cook-session-current:{userId}` alongside their existing deletions.

## Error Handling

`GET /cook-sessions/current` failing (network error, etc.) is treated as "no conflict" — `openWizard()` proceeds with the normal start flow, matching Phase D's discovery-call fallback philosophy. This call, like every other in this module, is best-effort and never blocks the user from starting a cook.

## Testing

Backend: unit tests for the new pointer's lifecycle (set with correct `recipeTitle` on start, deleted on finish, deleted on abandon) and the new endpoint (returns the pointer scoped to the caller, `null` when none exists). Frontend: no test framework in this codebase (established precedent) — `npm run build` + eslint clean is the bar.

## Out of Scope

- Any UI outside `RecipeDetail.tsx` — confirmed nothing else in the app renders a cook-start action.
- Any proactive/page-load-time "cooking elsewhere" indicator — this phase only requires the popup at the moment of a conflicting click.
- Phase G (post-cook review nudge) and Phase H (history/analytics page).
