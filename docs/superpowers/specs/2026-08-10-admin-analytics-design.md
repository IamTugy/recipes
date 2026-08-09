# Admin Analytics & AI Usage Tracking Design

**Goal:** Give the admin (site owner) visibility into what users do in the app, how much each AI feature is used per user per month, and general product stats (recipe counts, publish rate, ratings, user distribution) - without building a custom admin UI.

## Approach

Extend the existing `ActivityLogService`/`ActivityLog` collection (currently used only for view-count/trending) into the app's general event log, and log AI-feature usage into the same collection with a distinct action naming scheme. Point a self-hosted Metabase instance at MongoDB (read-only) and build every dashboard through its UI - no custom frontend admin pages, no separate usage-aggregation table.

## A. Event log - extend `ActivityLog`, don't fork it

Schema changes (`api/src/activity-log/schemas/activity-log.schema.ts`):
- `recipeId` becomes optional (`required: true` → `required: false`) - some actions (search, AI recipe generation before a recipe exists) have no recipe yet.
- `action` stays a free-form indexed string (already is) - no enum, so new action types never require a schema migration.
- `metadata` stays `Mixed`/optional (already is).

`ActivityLogService.record(userId, recipeId, action, metadata?)` signature stays the same in spirit but `recipeId` becomes `string | undefined` (still passed positionally; callers with no recipe pass `undefined`).

New actions and where each is recorded (one `activityLog.record(...)` call per site, same pattern as the existing `favorited`/`recipe_viewed` calls):

| Action | Site | Metadata |
|---|---|---|
| `recipe_created` | `RecipesService.createDraft` | - |
| `recipe_updated` | `RecipesService.updateDraft` | - |
| `recipe_submitted_for_review` | `RecipesService.submitForReview` (before the AI call) | - |
| `recipe_published` | `RecipesService.submitForReview` (score ≥ threshold branch) | - |
| `recipe_rejected` | `RecipesService.submitForReview` (score < threshold branch) | `{ score }` |
| `recipe_deleted` | `RecipesService.remove` (before soft-delete) | `{ title, ownerId }` - snapshot so the log stays readable even though the recipe is soft-deleted and could later be edited or hard-purged |
| `rating_given` | `RatingsController` create/update rating handler | `{ score }` |
| `search_performed` | Frontend `Home.tsx`, new - see below | `{ query, resultsCount }` |

`recipes.service.ts` and `ratings.controller.ts` already receive `ActivityLogService` or can have it injected the same way `RecipesController` does today.

**Search is currently client-side only** (`Home.tsx` filters an already-fetched recipe list - no backend search endpoint exists). To log it without adding a backend search endpoint: a small debounced (1s) `fetch('/api/activity/search', ...)` fire-and-forget call from `Home.tsx` whenever the effective query text changes and is non-empty, carrying `{ query, resultsCount }`. New minimal backend endpoint `POST /activity/search` (new tiny controller, or a method on `RecipesController`) that just calls `activityLog.record(userId, undefined, 'search_performed', { query, resultsCount })`. No response body needed beyond 204.

## B. AI usage - same collection, `ai_*_used` actions

Each of the 5 features that call `GeminiService` gets one `activityLog.record(userId, recipeId ?? undefined, '<action>', metadata?)` call, placed in the **controller** (not the service), right after the AI call succeeds - `userId` is already in scope there from the auth guard, and the controller is the natural "this feature was used" boundary.

| Action | Site |
|---|---|
| `ai_recipe_import_used` | `RecipeImportController` |
| `ai_recipe_generate_used` | `RecipeAiGenerateController` |
| `ai_photo_enhance_used` | `UploadsController` (`/enhance-photo`) |
| `ai_quality_review_used` | `RecipesService.submitForReview`, right after `qualityService.review(...)` returns (this one is service-level since it's triggered indirectly, not from its own controller) |
| `ai_nutrition_estimate_used` | `NutritionController` (`/estimate`) |

No new collection, no monthly-rollup job - Metabase computes `group by userId, month(timestamp), action` on demand from the raw event rows. If usage volume ever makes that slow, a rollup can be added later without touching the write path.

## C. Metabase deployment

Deploy Metabase (free/OSS edition, Docker image `metabase/metabase`) as a new service in the k3d cluster via the `new-service` skill, behind the existing Cloudflare Tunnel setup, on its own subdomain.

- **Database access:** a dedicated MongoDB user scoped read-only to the recipes database (least privilege - Metabase never needs to write). Created via `mongosh` against the existing `mongo-0` pod.
- **Auth:** Metabase's own built-in login (its first-run setup creates an admin account) - no integration with Clerk needed, this tool is only ever accessed by the site owner directly.
- **Dashboards to build** (via Metabase's UI, not code, once connected):
  1. **Event log browser** - filterable/sortable table over `activity_log`, filter by `action`, `userId`, date range.
  2. **AI usage per user per month** - pivot table: rows = `userId`, columns = month, values = count, filterable by `action` (one of the 5 `ai_*_used` actions) or grouped-by-action for a combined view.
  3. **Stats dashboard** - recipe count over time, status breakdown (draft/pending/published/rejected) pie or bar chart, ratings-given count/average, user distribution (recipes per owner), published vs. total ratio. All computed directly from the `recipes` and `ratings` collections - no event log needed for these since they're just current-state aggregates.

## D. Testing

- Backend: one unit test per new `activityLog.record(...)` call site, verifying the exact action/metadata recorded - mirrors the existing test style for `favorited`/`unfavorited` in `favorites.controller.spec.ts`. Includes a schema test confirming `recipeId` is no longer required (a document without `recipeId` validates).
- Frontend: the new debounced `search_performed` POST is fire-and-forget with no UI change - no automated test (no frontend unit test framework in this repo, per established convention); verified manually via network tab.
- Metabase dashboards are configuration, not code - no automated test. Verified manually once deployed: confirm each of the 3 dashboards renders and the read-only Mongo user genuinely can't write (attempt an insert from `mongosh` as that user and confirm it's rejected).
