# Cook Mode Redesign — Phase C: Cook Session Backend — Design

## Goal

Log a cook session's step-by-step timeline live in Redis while it's in progress; permanently persist it to Mongo only when the user finishes. Foundation phase for D (cross-device continuity), E (cooked-counter/cooldown), F (cook-conflict warning), G (post-cook review nudge), and H (history/analytics page) — those all read from or trigger off what this phase persists, but none of their features are built here. Third of several phases redesigning cook mode (Phase A and Phase B already shipped: `docs/superpowers/specs/2026-08-14-cook-mode-action-row-design.md`, `docs/superpowers/specs/2026-08-14-cook-mode-dock-design.md`).

## Background

`recipes-api` already has Redis wired in (`api/src/redis/`, `ioredis` client, used today only for a health-check ping) and deploys to a k3d cluster where a shared `redis` StatefulSet and its NetworkPolicy already permit `recipes-api` → `redis:6379` traffic — no new infra needed.

`CookDock.tsx` (Phase B) currently tracks cook-session state entirely client-side: `wizardIndex`/`checkedSteps` in `RecipeDetail.tsx`'s React state (persisted only to `sessionStorage`, keyed per recipe), and a `Date.now()`-based elapsed-time stopwatch inside `CookDock` that resets on page refresh and is never sent anywhere. Nothing about an in-progress or finished cook reaches the backend today.

A `CookLog` schema/module already exists (`api/src/cook-log/`) but is a simple per-`(userId, recipeId)` upsert boolean marker (unique index, no timing data) — it's what Phase E's cooked-counter will eventually bump, not something this phase's timeline data can reuse.

`ActivityLogService` (`api/src/activity-log/`) is a separate, existing system for admin-facing feature-usage analytics (the trending feed, per-recipe view/cook counts, the Metabase dashboard) — **this phase's session data must not be combined with it.** Activity log entries are named events with free-form metadata for "what feature got used"; cook-session data is the timeline of one specific cook. They stay in separate modules with separate schemas.

Starting a cook (`openWizard()`, Phase A's "Start cooking" button) is not sign-in gated today — anonymous users can use guided mode. The API's global Clerk auth guard requires a valid session for any route not marked `@Public()`.

## Approach

New `cook-sessions/` NestJS module, structured like the existing `favorites/`/`cook-log/` modules (schema + service + controller + module, `ActivityLogModule` NOT imported here).

**Auth boundary:** every new endpoint requires auth (no `@Public()`) via the existing global guard. The frontend only calls these endpoints when `currentUserId` is set; an anonymous user's cook session stays exactly as it behaves today — local stopwatch only, nothing recorded, no history. This is a deliberate scope line, not an oversight: history/statistics (Phase H) are inherently per-account features.

**Redis (live, in-progress session):** key `cook-session:{sessionId}` (a server-generated uuid, not fixed per-user — concurrent sessions across different recipes aren't blocked yet, that's Phase F's job), JSON value:

```json
{
  "userId": "user_123",
  "recipeId": "recipe_abc",
  "startedAt": "2026-08-14T10:00:00.000Z",
  "events": [
    { "stepKey": "checklist", "stepNum": 0, "enteredAt": "2026-08-14T10:00:00.000Z" },
    { "stepKey": "0-0", "stepNum": 1, "enteredAt": "2026-08-14T10:02:15.000Z" }
  ]
}
```

`stepKey` matches the format `CookDock.tsx` already uses for `checkedSteps` (`${groupIdx}-${stepIdx}`), with the literal string `"checklist"` for the ingredient-checklist screen so its (unmeasured, per Phase B) time is still visible in the raw event log even though it's excluded from step-duration math on finish. Every write (`EXPIRE cook-session:{sessionId} 86400`) resets the TTL to 24h from that write — an actively-cooked session never expires mid-use; one with no activity for 24h is silently treated as abandoned (Redis' own expiry does the cleanup, no cron job needed).

**Mongo (permanent, finished sessions):** new `CookSession` collection, separate from `CookLog`:

```ts
@Schema({ timestamps: true })
export class CookSession {
  @Prop({ required: true, index: true }) userId!: string
  @Prop({ required: true, index: true }) recipeId!: string
  @Prop({ required: true }) startedAt!: Date
  @Prop({ required: true }) finishedAt!: Date
  @Prop({ required: true }) totalDurationSeconds!: number
  @Prop({ type: [{ stepKey: String, stepNum: Number, enteredAt: Date, durationSeconds: Number }], required: true })
  steps!: { stepKey: string; stepNum: number; enteredAt: Date; durationSeconds: number }[]
}
```

One document per finished cook. `steps` excludes the `"checklist"` pseudo-step (Phase B's rule: unmeasured, not part of step numbering) but keeps its `enteredAt` implicitly as the session's `startedAt`. `durationSeconds` for each real step is computed server-side on finish as the gap to the next event's `enteredAt` (or to `finishedAt` for the last step) — full per-step timeline, not just an aggregate, so Phase H can eventually show which step took longest, not just a total.

## Endpoints

All under `/cook-sessions`, all requiring auth:

- `POST /cook-sessions/:recipeId` → creates the Redis entry (`startedAt` = now, `events: []`), returns `{ sessionId }`. Called once from `RecipeDetail.tsx`'s `openWizard()`.
- `POST /cook-sessions/:sessionId/steps` `{ stepKey: string; stepNum: number }` → appends an event with a **server-side timestamp** (never trusts a client-supplied time — avoids clock skew and tampering), refreshes the TTL. Returns `{ ok: true }`. Called by `CookDock` on every step transition: entering the checklist, checklist→step 1, every `onAdvance`/`onPrev`.
- `POST /cook-sessions/:sessionId/finish` → reads the Redis entry, computes durations, writes the permanent `CookSession` Mongo doc, deletes the Redis key, returns `{ ok: true }`. If the Redis key is already gone (expired, or a stale/replayed request), no-ops and returns `{ ok: true }` rather than erroring — a finish call must never surface an error to the user for something as harmless as a session that already expired. Called when `CookDock`'s `onAdvance` finishes the last step.
- `DELETE /cook-sessions/:sessionId` → deletes the Redis key without writing anything permanent. Same not-found tolerance as finish. Called by `CookDock`'s stop/✕ control (`onStop`).

Every one of these calls, on both the frontend caller and the endpoint's own internal error handling, must be safe to fail silently — mirroring `ActivityLogService.record()`'s existing "never throws, never blocks the feature it's attached to" convention. **This is a recording layer, not a source of truth the live UI depends on:** `CookDock`'s client-side stopwatch and step state (Phase B, untouched by this phase) remain what the user actually sees and interacts with regardless of whether these calls succeed. A dropped network request mid-cook should never block or visibly disrupt cooking.

## Frontend Wiring

`RecipeDetail.tsx`:
- `openWizard()` additionally fires `POST /cook-sessions/:recipeId` (fire-and-forget, only if `currentUserId` is set) and stores the returned `sessionId` in a new piece of state, passed down to `CookDock` as a prop.
- `stopCooking()` (the `onStop` handler) additionally fires `DELETE /cook-sessions/:sessionId` (fire-and-forget) before/alongside clearing `cookSessionActive`.

`CookDock.tsx`:
- The existing screen/step-transition points (checklist→steps, `onAdvance`, `onPrev`) each additionally fire `POST /cook-sessions/:sessionId/steps` with the entered step's `stepKey`/`stepNum` (fire-and-forget).
- The last step's `onAdvance` (today: `markStepChecked(key); advanceWizardOrFinish()`) additionally fires `POST /cook-sessions/:sessionId/finish` (fire-and-forget) before/alongside ending the session.
- If `sessionId` is `null`/`undefined` (anonymous user, or the start call hasn't resolved yet, or it failed), all of the above become no-ops — cooking proceeds exactly as it does today with zero backend involvement.

No other Phase B UI/behavior changes. The dock doesn't read anything back from these endpoints; it only calls them.

## Error Handling

- Network failures on any of the four endpoints: caught and swallowed on the frontend, never surfaced to the user, never retried (a missed step-log event just means that step's duration is slightly off or absent from the eventual permanent record — acceptable data loss for a non-critical analytics feature).
- `finish`/`abandon` on an already-expired or already-finished session: treated as success (idempotent no-op), not an error — see Endpoints section above.
- A `steps` call for a `sessionId` that's already expired/gone: also a silent no-op (`{ ok: true }`) — the event is simply not recorded, no error surfaced.

## Testing

Standard NestJS unit tests for the new service (mocking `RedisService`/the Mongoose model, matching `cook-log.service.spec.ts`'s pattern) and controller (matching `cook-log.controller.spec.ts`'s pattern): start creates a Redis entry and returns a `sessionId`; steps appends an event and resets TTL; finish computes correct per-step durations from a given event list and writes the expected Mongo document shape, then deletes the Redis key; finish/abandon on a missing key no-ops without throwing. No frontend test framework exists in this codebase (per Phase B's precedent) — frontend wiring is verified by `npm run build` + eslint clean, same as Phase B.

## Out of Scope

- Cross-device continuity / resuming a session on a different device (Phase D) — the data model here (a `sessionId` keyed independent of any particular device/tab) doesn't foreclose this, but no read/resume endpoint is built now.
- Deriving the cooked-counter + cooldown from a finished session (Phase E) — the `finish` endpoint is a natural future call site for `CookLogService`, but doesn't call it yet.
- Blocking/warning on concurrent cook sessions (Phase F) — `sessionId` isn't currently unique-per-user, so nothing here prevents starting two.
- Triggering the post-cook review nudge (Phase G) — `finish` doesn't fire any notification/reminder logic yet.
- The actual history/analytics UI reading `CookSession` documents (Phase H) — no read endpoint for a user's past sessions is built in this phase.
