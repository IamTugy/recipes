# Cook Mode Redesign — Phase D: Cross-Device Continuity — Design

## Goal

Let a user resume an in-progress cook session on a different device than the one they started it on — start cooking on a phone in the kitchen, later open the same recipe on a tablet or laptop and pick up at the same step, with the same checked ingredients/steps and the same elapsed-time baseline. Fourth of several phases redesigning cook mode (A, B, C already shipped — see `docs/superpowers/specs/2026-08-14-cook-mode-action-row-design.md`, `docs/superpowers/specs/2026-08-14-cook-mode-dock-design.md`, `docs/superpowers/specs/2026-08-14-cook-session-backend-design.md`).

## Background

Phase C added `api/src/cook-sessions/`: a Redis-backed live session (key `cook-session:{sessionId}`, JSON `{ userId, recipeId, startedAt, events: [{ stepKey, stepNum, enteredAt }] }`, TTL refreshed to 24h on every write) with four endpoints — start, log-step, finish (persists a permanent Mongo `CookSession` doc), and abandon. `sessionId` is an opaque server-generated UUID that only ever lives in the frontend's React state (`RecipeDetail.tsx`'s `cookSessionId`) — nothing writes it anywhere durable, and there is no way today to look up "is there an active session for this user+recipe" without already knowing the UUID. `events` is Phase C's append-only log for computing per-step durations on finish; it records every step *entry*, including duplicates from back-navigation, and was never meant to be replayed to reconstruct UI state.

Phase B's `checkedSteps`/`checkedIngredients`/`wizardIndex` state in `RecipeDetail.tsx` is genuinely per-device today: persisted only to `sessionStorage` (keyed `checked-${id}`/`checked-ingredients-${id}`), never sent to the backend. `CookDock.tsx`'s elapsed-time stopwatch is a pure client-side `Date.now()` clock with no backend involvement and no way to be told "actually, this session already started 12 minutes ago."

## Approach

Extend the Phase C Redis session blob with a mutable "resume state" that sits alongside (not instead of) the existing append-only `events` log — `events` keeps doing exactly what Phase C built it for (Mongo duration math on finish) and is untouched by this phase. Add a secondary Redis index so a device can discover an active session by `(userId, recipeId)` instead of needing to already hold its `sessionId`. Add a discovery/read endpoint and a lightweight sync endpoint. On the frontend, resuming is fully automatic (per your explicit decision): opening a recipe that has an active session elsewhere — whether by just loading the page or by clicking "Start cooking" again — always resumes it silently, no confirmation prompt, no distinction between those two entry points. While a session is active, an open tab polls every 5 seconds to pick up changes made from another device.

## Data Model

Extend the existing `cook-session:{sessionId}` Redis JSON (Phase C's shape, unchanged fields kept):

```json
{
  "userId": "user_123", "recipeId": "recipe_abc", "startedAt": "2026-08-14T10:00:00.000Z",
  "events": [ { "stepKey": "0-0", "stepNum": 1, "enteredAt": "2026-08-14T10:02:15.000Z" } ],
  "currentStepKey": "0-1", "currentStepNum": 2,
  "checkedSteps": ["0-0", "0-1"], "checkedIngredients": ["0-0", "1-2"]
}
```

`currentStepKey`/`currentStepNum`/`checkedSteps`/`checkedIngredients` are new — a live mutable snapshot, overwritten wholesale on every sync call (not derived by replaying `events`, which is unreliable for this purpose since it's append-only with duplicates from back-navigation and was never designed to represent "current" state).

New secondary key `cook-session-active:{userId}:{recipeId}` → `sessionId` (plain string value, same 24h TTL semantics: set when a session starts, refreshed whenever the main session key's TTL is refreshed, deleted when the session finishes or is abandoned). This is the only way to go from "I know the recipe and the user" to "here's the active sessionId" — without it, discovery is impossible since `sessionId` is an opaque UUID with no other index.

## Endpoints

Two new endpoints under the existing `/cook-sessions` controller:

- `GET /cook-sessions/active/:recipeId` → looks up `cook-session-active:{userId}:{recipeId}` (using the authenticated `req.userId`), and if found, reads and returns the corresponding session's resume-relevant fields: `{ sessionId, currentStepKey, currentStepNum, checkedSteps, checkedIngredients, startedAt }`. Returns `null` (200, not 404) if no active session exists for this user+recipe — this is an expected, common case (most page loads aren't mid-cook), not an error. Called on every recipe page load (signed-in users only) and polled every 5s while `cookSessionActive`.
- `POST /cook-sessions/:sessionId/sync` `{ currentStepKey: string; currentStepNum: number; checkedSteps: string[]; checkedIngredients: string[] }` → overwrites those four fields on the session (ownership-checked the same way `logStep`/`finish`/`abandon` already are — silent no-op on a missing or wrong-owner session, matching Phase C's existing convention), refreshes the session's TTL. Called whenever any of those four values changes locally: step transition (Prev/Next/checklist→steps), an ingredient checkbox toggle, or a step "mark done" toggle.

Existing Phase C endpoints (`start`, `steps`, `finish`, `abandon`) all additionally maintain the new index key: `start` sets it, `finish`/`abandon` delete it. `steps` (the existing per-transition event logger) is untouched — it still only appends to `events`; the new `sync` endpoint is the sole writer of the four new snapshot fields, keeping the two responsibilities (immutable timing log vs. mutable resume state) cleanly separate.

## Frontend Wiring

`RecipeDetail.tsx`:
- On mount (recipe loaded, `currentUserId` set), calls `GET /cook-sessions/active/:recipeId`. If a session comes back: restores `checkedSteps`/`checkedIngredients`/`wizardIndex` (derived from `currentStepKey`/`currentStepNum`) from the response instead of `sessionStorage`, sets `cookSessionId`/`cookSessionActive`, and computes an elapsed-time baseline from the session's `startedAt` to pass into `CookDock` (new prop) so its stopwatch continues from the correct offset instead of restarting at zero. If no session comes back, today's existing `sessionStorage`-based restore behavior is unchanged.
- While `cookSessionActive`, polls the same discovery endpoint every 5 seconds and overwrites local `checkedSteps`/`checkedIngredients`/`wizardIndex` with whatever the server returns — server-wins, no merge/conflict logic. True simultaneous editing from two devices at the exact same moment isn't a scenario worth building reconciliation for; the common case is one device actively cooking at a time with an old device's view catching up.
- Every existing state-changing call site that currently mutates `checkedSteps`/`checkedIngredients`/`wizardIndex` (toggle ingredient, mark step done, Prev/Next/checklist-advance) additionally fires the new sync call (fire-and-forget, same convention as Phase C's other calls — never blocks the UI, never surfaces an error).

`CookDock.tsx`: gains one new prop, an elapsed-time baseline (a timestamp or an initial-seconds-elapsed value) so its existing `Date.now()`-based stopwatch effect anchors to that baseline instead of always starting at 0 on mount. No other changes — the dock's own gesture/layout/screen logic (Phase B) is untouched.

## Error Handling

- Discovery call fails (network error, 401, etc.): the page simply loads in its normal non-cooking state, exactly as if no session existed — never blocks page load, never shows an error.
- Sync call fails: that particular local change just doesn't propagate to other devices until the next successful sync (fire-and-forget, matching every other Phase C call).
- Polling tick fails: silently skipped, tried again on the next 5s tick, no visible disruption.
- Ownership mismatch (a session's `userId` doesn't match the caller) on `sync`: silent no-op, same convention Phase C already established for `logStep`/`finish`/`abandon`.

## Testing

Backend: unit tests for the new index-key lifecycle (`start` sets `cook-session-active:{userId}:{recipeId}`, `finish`/`abandon` delete it), the discovery endpoint (returns the right session when one exists, `null` when it doesn't, ownership-scoped to the caller), and the sync endpoint (overwrites the four snapshot fields, leaves `events` untouched, refreshes TTL, silent no-op on wrong owner or missing session) — same jest patterns already established in `api/src/cook-sessions/*.spec.ts`. Frontend: no test framework in this codebase (per Phase B/C precedent) — `npm run build` + eslint clean is the verifiable bar.

## Out of Scope

- Phase F's "warn before starting a second concurrent cook" — applies only to starting a session on a *different* recipe while one is active elsewhere; explicitly does not apply to this phase's same-recipe auto-resume, which never warns, by your explicit decision.
- Real-time push (WebSockets/SSE) — polling every 5s while a tab is open is the full extent of "live" sync in this phase; no infra for push exists in this codebase today.
- Any UI indicator that a session is currently active on another device (e.g. "also cooking on your phone") — not requested, not built.
- Conflict resolution for genuinely simultaneous edits from two devices — server-wins-on-poll is the entire strategy; no merge logic.
