# Recipes App

NestJS API in `api/`, React/Vite frontend in `src/`, MongoDB, Clerk auth. Deploys via GitHub Actions on push to `main` (see `docs/superpowers/...` for related infra notes and the self-hosted k3d/Cloudflare Tunnel setup this app runs on).

## Activity logging

Every new user-facing action that mutates state (create/update/delete, or a distinct "used this feature" moment) should call `ActivityLogService.record(userId, recipeId | undefined, action, metadata?)`. It's used for the trending feed, per-recipe view/cook counts, and the Metabase admin analytics dashboard - a feature with no log entry is invisible to all three.

- Log at the controller layer, right after the mutating service call succeeds (see `favorites.controller.ts`, `ratings.controller.ts`, `recipes.controller.ts` for the pattern).
- `record()` never throws - it swallows its own failures - so it's always safe to call without try/catch.
- Naming: `<noun>_<verb_past_tense>`, e.g. `recipe_cooked`, `collection_created`, `feature_request_denied`. Keep it consistent with existing action names in `api/src/*/*.controller.ts` (search for `activityLog.record` to see the current set).
- Pass `metadata` for anything a future dashboard query might want to group/filter by (a score, a count, a title) - it's a free-form object, cheap to include.
- Skip logging for: read-only endpoints, endpoints with no real userId (`@Public()` crawler routes), and per-keystroke/internal support calls (e.g. the translation endpoint used by autotranslate-on-blur) - those would just add noise.
- When adding a new module with its own controller, wire `ActivityLogModule` into its `imports` the same way `favorites.module.ts` does, so the service can be injected.

Before finishing any feature that adds a new mutating endpoint, check whether it needs an activity log entry - don't wait to be asked.
