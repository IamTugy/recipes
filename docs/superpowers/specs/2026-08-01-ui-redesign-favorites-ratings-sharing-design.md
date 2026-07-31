# UI Redesign + Favorites + Ratings + Sharing

**Sub-project 2 (combined)** of the recipes app rebuild, following backend foundation (sub-project 1, shipped). Bundles the visual redesign with favorites/ratings (originally sub-project 4) since the redesign touches the same recipe card and detail components those features need, and folds in a lightweight sharing feature.

## Context

The backend foundation (Clerk auth gate, Mongo/Redis, recipes API, activity log write-path) is live at recipes.tugy.dev. The frontend fetches recipes from the authenticated API and gates the whole app behind Clerk sign-in, but its visual design is unchanged from before this rebuild — plain cards, no favorites/ratings, no sharing. The `favorites` and `ratings` Mongoose collections exist (schema/indexes only, from sub-project 1) with no service, controller, or frontend wired to them yet.

## Goals

- Redesign the visual identity toward an "editorial cookbook" feel: large photography, magazine-scale serif typography, generous whitespace — built on the existing amber/terra/herb/cream token system and light/dark theming (kept as-is, just pushed harder).
- Favorites: users can star/unstar a recipe; a "Favorites" filter on Home shows only starred recipes.
- Ratings: users can rate a recipe 1-5; the recipe card/detail shows the average rating and count.
- Sharing: a share button on the recipe detail page that copies/shares the current URL. No new backend — the existing Clerk gate already preserves the URL through sign-in (see Architecture).

## Non-goals

- No public (unauthenticated) sharing — recipient must sign in with their own Google account, per the existing gate.
- No comments, no social feed, no follow/friends system.
- No changes to the timer/session sync behavior (that's still a separate, later sub-project).
- No changes to the activity-log dashboard (still deferred).

## Architecture

### Sharing (no backend change)

`App.tsx`'s auth gate renders `<SignIn />` **in place** when signed out — it does not navigate away from the current page. Since the app uses `HashRouter`, the current route (e.g. `#/recipe/some-slug`) lives entirely in `window.location.hash`, which is untouched by that render swap. A signed-out visitor who opens a shared recipe URL sees the sign-in screen; once `isSignedIn` flips true, the same render tree resolves the same hash into the same `RecipeDetail` route. Sharing is therefore just a UI affordance: a button on `RecipeDetail` that calls `navigator.share({ url: window.location.href, title })` where available, falling back to `navigator.clipboard.writeText` with a toast/confirmation.

### Favorites

- Backend: `FavoritesController` in the existing `favorites` module.
  - `GET /favorites` → array of the current user's favorited recipe slugs.
  - `POST /favorites/:slug` → add (idempotent — upsert, matches the existing unique `{userId, recipeSlug}` index from sub-project 1).
  - `DELETE /favorites/:slug` → remove.
  - Each toggle calls the existing `ActivityLogService.record(userId, slug, 'favorited' | 'unfavorited')`.
- Frontend: a new `useFavorites()` hook (mirrors `useRecipes`'s auth-aware fetch pattern) exposing `favoriteSlugs: Set<string>`, `toggle(slug)`. A star icon on `RecipeCard` and `RecipeDetail` calls `toggle`. Home gets a "Favorites" filter chip alongside the existing category chips, filtering `recipes` down to `favoriteSlugs`.

### Ratings

- Backend: `RatingsController` in the existing `ratings` module.
  - `PUT /ratings/:slug` body `{ score: 1-5 }` → upsert by `{userId, recipeSlug}` (existing unique index), validated server-side to 1-5.
  - `RecipesService.findBySlug` (and `findAll`) extended to compute and attach `averageRating` and `ratingCount` via a Mongo aggregation against the `ratings` collection (joined by `recipeSlug`), so the frontend gets this for free on the existing recipe fetch — no separate ratings-read endpoint needed.
- Frontend: a 5-star input component on `RecipeDetail` (click to rate, shows the user's own rating if set); `RecipeCard` and `RecipeDetail` display `averageRating`/`ratingCount` when present.

### Visual redesign

- Scope: `Home.tsx`, `RecipeCard.tsx`, `RecipeDetail.tsx`, `Nav.tsx`, `index.css` (typography/spacing scale), `tailwind.config.js` (only if new scale values are needed — the color tokens stay).
- Home: hero-style search/filter block with more vertical breathing room; recipe grid cards get larger image aspect ratio and magazine-style serif title treatment.
- RecipeDetail: clearer visual separation between ingredients/steps, sticky-on-scroll timer/multiplier control bar (mobile-friendly, matches the research pattern of bottom-anchored controls for one-handed use while cooking).
- Nav: adds the favorites filter entry point and Clerk's `<UserButton>` (sign-out, profile).
- No new dependencies beyond what's already installed (Tailwind, Framer Motion) — this is a styling/composition pass, not a framework change.

## Data model changes

- `favorites` collection: no schema change (already `{userId, recipeSlug}` unique-indexed from sub-project 1).
- `ratings` collection: no schema change (already `{userId, recipeSlug, score}` unique-indexed).
- `recipes` API responses gain two computed, non-persisted fields: `averageRating: number | null`, `ratingCount: number`.

## Error handling

- Favorites/ratings endpoints: standard Clerk-guarded 401 on missing/invalid auth (inherited from the global guard, nothing new to build).
- Rating score outside 1-5: 400 Bad Request via a NestJS validation pipe.
- `navigator.share` unavailable (desktop browsers without the Web Share API): falls back to clipboard copy; clipboard write failure (rare, permissions) shows an inline "couldn't copy" message rather than throwing.
- Favorite/rating API failure: optimistic UI update rolls back on error, with a brief inline error state (consistent with how `Home`/`RecipeDetail` already handle fetch errors).

## Testing

- Backend: unit tests for `FavoritesController`/`RatingsController` (toggle idempotency, 400 on invalid score, activity-log call), and for the `RecipesService` aggregation (average/count computed correctly, `null`/`0` when no ratings exist).
- Frontend: no new automated test infra introduced in sub-project 1 for the frontend (no Vitest/RTL setup exists yet) — manual verification via the running app is the bar for this round, matching the existing frontend's test posture. Adding a frontend test framework is out of scope here (a separate, explicit decision if wanted later).

## Self-review notes

- Placeholder scan: none found.
- Consistency: sharing's "no backend" claim depends on the sign-in gate rendering in-place rather than redirecting — confirmed true of the current `App.tsx` implementation (verified in code, not just assumed).
- Scope: appropriately bundled — all three features touch the same recipe-card/detail surface the redesign is also touching, avoiding two passes over the same files.
