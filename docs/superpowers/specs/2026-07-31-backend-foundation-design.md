# Backend Foundation: Auth + Data Layer

**Sub-project 1 of 5** in the recipes app rebuild. Establishes the backend, auth gate, and data layer that later sub-projects (UI redesign, timer sync, favorites/ratings, activity dashboard) build on.

## Context

The recipes app (recipes.tugy.dev) is currently a fully static React/Vite site: recipes are baked in at build time from YAML files (`src/data/recipes/`), served by nginx, no backend, no auth, no persistence. The full rebuild adds:

1. Backend + auth (this spec)
2. UI redesign
3. Cross-device timer/ongoing-recipe sync
4. Favorites + 1-5 star ratings
5. Activity log dashboard (admin-only)

Each is its own spec/plan/implementation cycle. This spec covers #1 only.

## Goals

- Gate all recipe content behind sign-in (Google OAuth only, open signup, anyone with a Google account can join).
- Stand up the data layer (Mongo + Redis) that later sub-projects will read/write.
- Migrate recipe content from static YAML into Mongo, without changing the git-based editing workflow.
- Plumb activity-log write path now so later features (favorite, rate, start recipe) just add an insert call.

## Non-goals (deferred to later sub-projects)

- Timer/ongoing-recipe session sync (sub-project 3).
- Favorites and ratings features (sub-project 4).
- Activity log dashboard UI / read endpoints (sub-project 5).
- Any UI visual redesign (sub-project 2).
- Recipe admin CRUD UI, recipes are still authored as YAML in git.

## Architecture

```
Browser
  │  (Clerk session, same-origin cookies/bearer)
  ▼
nginx (existing "recipes" container)
  ├─ /            → static frontend (React SPA)
  └─ /api/*       → proxy_pass → recipes-api (ClusterIP, internal DNS)
                        │
                        ├─ Mongo (durable: users, recipes, favorites*, ratings*, activity_log)
                        └─ Redis (ephemeral: timers*, ongoing-recipe session, TTL)

  * favorites/ratings/timers collections created but unused by BE logic until their sub-projects land
```

- New service `recipes-api`: NestJS, TypeScript, containerized, deployed to k3d `apps` namespace, same pattern as existing `recipes` deployment (see `~/server.md`), new `k8s/apps/recipes-api/` manifests in the server repo (deployment, service, ingress not needed since only reached internally, network-policy allowing `recipes` → `recipes-api` and `recipes-api` → Mongo/Redis).
- `nginx.conf` in the frontend container gains a `location /api/ { proxy_pass http://recipes-api.apps.svc.cluster.local:80/; }` block. Same-origin from the browser's perspective, no CORS config needed, and Clerk's cookie-based session (if used) works without cross-site cookie issues.
- Mongo and Redis run in-cluster: single-replica Deployment + PVC each, in `apps` namespace. Not a managed service, matches the scale and self-hosted philosophy of the rest of the cluster.

## Auth flow

- Clerk (free tier) provides auth. Google OAuth only, open signup, no invite/allowlist gate.
- Frontend wraps the app in Clerk's `<ClerkProvider>`. Unauthenticated users see only the Clerk sign-in screen, the gate sits at the router root, not per-component, so no recipe content ever reaches an unauthenticated browser (not even in a network response).
- Every API call from the frontend attaches the Clerk session token as `Authorization: Bearer <token>`.
- Backend: a NestJS guard applied globally verifies the token via `@clerk/backend`'s `verifyToken`, using a Clerk secret key stored as a Sealed Secret (`kubeseal`, committed to the server repo per existing convention).
- On first-seen `userId` (from the verified token), the guard upserts a `users` doc `{ clerkUserId, email, name, createdAt }`, no separate registration step.
- Missing/invalid/expired token → 401 on every `/api/*` route. Frontend treats 401 as "session expired," redirects to Clerk sign-in.

## Recipe migration + data model

- YAML files in `src/data/recipes/` remain the source of truth. Recipes are still authored/edited via git PR, no change to that workflow.
- A new idempotent seed step (NestJS CLI command or standalone script run on BE startup/deploy) parses the YAML files and upserts each into the Mongo `recipes` collection, keyed by a stable `slug` field (derived from filename, matching current convention).
- `recipes` doc shape: existing recipe fields (title, ingredients, steps, timers, source attribution, etc.) plus `slug` (unique key) and an `imageUrl` pointing at the existing R2-hosted image, R2 upload pipeline (`scripts/upload-to-r2.mjs`) is unchanged.
- Frontend fetches recipe list/detail from `recipes-api` instead of the bundled YAML import (this sub-project only builds the read endpoints `GET /recipes`, `GET /recipes/:slug`; wiring the frontend to actually call them instead of local data happens as part of sub-project 2's UI work, since it touches the same components).
- `activity_log` doc shape: `{ userId, recipeId, action, timestamp, metadata? }`. This sub-project defines the schema and a reusable `ActivityLogService.record(...)` write method, and calls it for `recipe_viewed`. Later sub-projects call the same method for `recipe_started`, `favorited`, `rated`, etc. No read endpoint or dashboard yet (sub-project 5).
- `favorites` and `ratings` collections are declared (schema/indexes only) but have no reads/writes yet, avoids a later migration, doesn't add unused feature code.

## Error handling

- Redis unreachable: timer/session-dependent features (none active yet in this sub-project, but the client established here is shared by sub-project 3) degrade to an "unavailable" state rather than crashing the request; recipe browsing is unaffected since it doesn't touch Redis.
- Mongo unreachable: `/api/recipes*` returns 503; frontend shows a retry state instead of a blank/crashed page.
- Invalid/expired Clerk token: 401 as described above.
- Seed step failures are logged but don't block BE startup, the API serves whatever is already in Mongo from the last successful seed.

## Testing

- Unit tests (Jest, NestJS default): auth guard (valid/invalid/missing token paths), recipes service (list/get by slug), seed step idempotency (running it twice produces no duplicates/changes), `ActivityLogService.record`.
- Integration tests: guard + recipes flow end-to-end against `mongodb-memory-server`; Redis client wiring tested against a real Redis via testcontainers (even though nothing uses it yet, prove the connection/health-check path works for sub-project 3 to build on).
- No frontend test changes in this sub-project, frontend still reads local YAML data until sub-project 2 rewires it to the API.

## Deployment

- Same repo (`IamTugy/recipes`). Frontend stays at root (unchanged paths, existing `Dockerfile`/CI untouched); new NestJS service lives in `api/` with its own `Dockerfile`.
- CI: existing GitHub Actions workflow gains a second build/push job for `tugy/recipes-api` (mirrors the existing frontend job, triggered on changes under `api/`); server repo gets new `k8s/apps/recipes-api/` manifests (deployment, service, network-policy) following the standard pattern in `~/server.md`.
- Clerk secret key and Mongo/Redis connection strings delivered as Sealed Secrets, consistent with existing secrets handling.
