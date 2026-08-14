# Cook Mode Redesign — Phase G: Post-Cook Review Nudge — Design

## Goal

Prompt a user to write a review right after finishing a guided cook, and remind them again (in-app, next visit) if 24 hours pass without one. Seventh of several phases redesigning cook mode (A-F already shipped).

## Background

Finishing a guided cook session (`advanceWizardOrFinish()`'s last-step branch in `RecipeDetail.tsx`) already calls `finishCookSession`, which writes a permanent `CookSession` Mongo document (Phase C) with `userId`/`recipeId`/`finishedAt`. `RecipeDetail.tsx` already has a full review UI (star rating via `rate()`, a comment textarea bound to `reviewComment`, an optional photo via `handlePhotoSelect`, submission via `postReview()`/`submitRating()`), and already tracks `hasPostedReview` — defined as the user's `Rating` document (one per `(userId, recipeId)` pair, unique-indexed) having a non-empty `comment`, not merely a star score.

This codebase has no email, no web push, and no scheduler (confirmed by survey) — this phase is explicitly in-app only, per your decision.

## Approach

**Trigger condition** (shared by both the modal and the banner below): a `CookSession` exists for `(userId, recipeId)` with no corresponding `Rating.comment` yet. If the user already reviewed a prior cook of the same recipe, neither surface appears for a later finish of that same recipe.

**Immediate modal:** a new component, shown the moment `advanceWizardOrFinish()` ends the session, gated on `!hasPostedReview`. Renders a condensed star-rating + comment + optional-photo form wrapped in the existing `Modal` component — reusing `RecipeDetail.tsx`'s existing state and handlers (`rate`, `reviewComment`/`setReviewComment`, `handlePhotoSelect`, `postReview`) rather than duplicating them; only the JSX rendering is new, not the underlying state. A "Maybe later" button dismisses without submitting; submitting behaves exactly like the existing inline form and closes the modal.

**24h-later banner:** a new globally-mounted component (`main.tsx`, same pattern as `JobsWatcher.tsx`'s poll-and-toast) that checks once per app load: `GET /cook-sessions/reminders` → the signed-in user's finished-but-unreviewed `CookSession`s where `finishedAt` is at least 24 hours old, each returned as `{ recipeId, recipeTitle, finishedAt }`. Shows a dismissible banner ("How was **[recipeTitle]**? Leave a review") linking to that recipe's page. Dismissal is a local, per-recipe `localStorage` flag — not synced across devices, since the underlying condition (an actual posted review) is what permanently clears it either way; a lost local dismissal on a different device just means seeing the banner once more, not a real failure.

**Backend:** one new read-only endpoint, `GET /cook-sessions/reminders`, in the existing `api/src/cook-sessions/` module. Queries `CookSession` (existing collection, unmodified) for the caller's finished sessions older than 24h, left-excludes any `(userId, recipeId)` pair that has a `Rating` with a non-empty `comment` (existing `Rating` collection, unmodified), and resolves each remaining `recipeId`'s title via the `Recipe` model (same pattern already used by Phase F's current-cook pointer). Deliberately narrow and purpose-built — not a general cook-history endpoint, which is explicitly Phase H's job.

## Data Flow

1. `advanceWizardOrFinish()` finishes the session as today, then additionally checks `hasPostedReview` for the current recipe; if false, opens the new modal.
2. The banner component, mounted once globally, calls `GET /cook-sessions/reminders` on mount (page load / app start), filters out any `recipeId` the user has locally dismissed, and shows a banner for the first (or only) remaining entry.
3. Posting a review from either the modal or the existing inline form calls the same `postReview()`/`submitRating()` path as today — no new write path. The next time the banner's endpoint is queried, that recipe's now-reviewed `CookSession` no longer matches (a `Rating.comment` now exists for it).

## Error Handling

`GET /cook-sessions/reminders` failing (network error, etc.) simply means the banner doesn't show that session — no error surfaced to the user, matching every other cook-sessions endpoint's best-effort philosophy on the frontend.

## Testing

Backend: unit tests for the reminders query — a finished, unreviewed, >24h-old session is included; a finished session under 24h old is excluded; a finished session that already has a `Rating.comment` is excluded; a finished session with only a star rating and no comment is still included (matches `hasPostedReview`'s existing definition); results are scoped to the caller's own `userId`. Frontend: no test framework in this codebase (established precedent) — `npm run build` + eslint clean is the bar.

## Out of Scope

- Any push notification or email delivery — explicitly deferred per your scope decision; this phase is in-app only.
- A full cook-history/analytics UI — Phase H's job.
- Any change to what "reviewed" means elsewhere in the app (rating badges, review lists, etc.) — `hasPostedReview`'s existing comment-based definition is reused as-is, not redefined.
- Cross-device sync of dismissed banners — local-only, by design (see Approach).
