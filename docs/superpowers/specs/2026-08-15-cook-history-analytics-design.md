# Cook Mode Redesign — Phase H: Recipe History & Analytics — Design

## Goal

A dedicated space for a user to see everything they've cooked and how they cook — a global history + aggregate stats page, plus a per-recipe drill-down with trend and per-step timing detail. Final phase of the cook-mode redesign (A-G already shipped).

## Background

Phase C's `CookSession` collection already has a permanent record of every finished cook: `{ userId, recipeId, startedAt, finishedAt, totalDurationSeconds, steps: [{ stepKey, stepNum, enteredAt, durationSeconds }] }`. Phase E's `CookLog` collection is a separate append-only per-user-per-recipe cook-event log used today only for aggregate counts. No endpoint reads either collection back for a user — every existing endpoint either writes new records or returns pre-aggregated counts (`cookCount`/`userCookCount`). No route/page exists for this yet. No charting library exists in this app (confirmed by package.json survey) — this phase adds one (`recharts`, your decision).

## Approach

**New backend module, `api/src/cook-history/`** — read-only, no new schemas. Deliberately separate from `api/src/cook-sessions/` (which owns the live session lifecycle) so read/analytics logic doesn't bloat that module further, injecting the existing `CookSession` model directly.

**Three endpoints, all scoped to the authenticated caller (`req.userId`), no `@Public()`:**

- `GET /cook-history/stats` → `{ totalRecipesCooked: number; totalCooks: number; totalTimeSpentSeconds: number; cooksByMonth: { month: string; count: number }[]; mostCooked: { recipeId: string; recipeTitle: string; count: number }[] }`. `totalRecipesCooked` = distinct `recipeId` count across the caller's finished sessions; `totalCooks` = total session count; `cooksByMonth` covers the trailing 12 months (`month` as `"YYYY-MM"`), zero-filled for months with no cooks; `mostCooked` is the top 5 recipes by session count, titles resolved via the `Recipe` model.
- `GET /cook-history` → most-recent-first, capped/paginated list: `{ recipeId: string; recipeTitle: string; finishedAt: string; totalDurationSeconds: number }[]`. Capped at a fixed page size (100) rather than building full cursor pagination — this phase's data volume (one user's own history) doesn't need more, and nothing in the design calls for infinite scroll.
- `GET /cook-history/:recipeId` → `{ recipeTitle: string; sessions: { finishedAt: string; totalDurationSeconds: number; steps: { stepNum: number; durationSeconds: number }[] }[] }`, most-recent-first. Step labels are step NUMBERS only, not instruction text — a `CookSession`'s captured steps don't record which recipe revision they belonged to, and instructions can change after the fact, so numbers are the only thing safe to show without a stale/misleading label.

**Two new frontend pages:**

- `/cook-history` — new sidebar entry (added to the existing link array in `Sidebar.tsx`, same list `myRecipes`/`myCollections`/`mealPlan` already live in). Layout top to bottom: three stat cards (recipes cooked, total cooks, total time — formatted as hours/minutes), a `recharts` bar chart of `cooksByMonth`, a "most cooked" list (`mostCooked`, linking each to its drill-down), then the chronological `GET /cook-history` list — each entry (recipe title, date, duration) links to `/cook-history/:recipeId`.
- `/cook-history/:recipeId` — recipe title header (linking back to the recipe's own page), stats (times cooked, total/average time), a small trend chart (one bar per session, height = duration, over time), then a list of individual sessions — each expandable to a small per-step bar chart (`steps`, x-axis = step number, y-axis = duration).

**Data flow:** both pages fetch on mount via `apiFetch`-style calls (matching this codebase's existing GET pattern), no polling, no real-time updates — this is historical data, nothing here changes while the page is open except by cooking something new in another tab, which isn't specially handled (a stale view until refresh is acceptable for a history page).

**Error handling:** a failed fetch on either page shows the existing app-wide error/empty-state pattern (check `MyRecipesPage.tsx`/`CollectionsPage.tsx` for the established loading/error/empty convention and match it) — no bespoke error UI invented for this phase.

## Testing

Backend: unit tests for each endpoint's aggregation logic — `stats`' distinct-recipe count, total-cooks count, total-time sum, 12-month zero-filled bucketing, top-5 most-cooked ordering; the paginated list's cap and most-recent-first ordering; the per-recipe endpoint's session/step shape and title resolution. Frontend: no test framework in this codebase (established precedent) — `npm run build` + eslint clean is the bar.

## Out of Scope

- Editing or deleting history entries.
- Exporting history data (CSV, etc.).
- Comparing against other users' cooking stats.
- Cursor-based/infinite-scroll pagination beyond the fixed 100-item cap.
- Any change to `CookSession`/`CookLog` schemas — this phase is read-only against what already exists.
