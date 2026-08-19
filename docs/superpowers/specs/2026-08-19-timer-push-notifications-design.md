# Timer Push Notifications — Design

## Goal

Alert the owner when a kitchen timer finishes even while the app/phone screen is backgrounded or minimized — like a native alarm app, not just a foreground sound. Covers every timer (cook-mode or a standalone step timer), not just ones tied to an active cook session.

## Background

`useTimers.ts`/`TimerPanel.tsx` correctly recompute a timer's remaining time from wall-clock (`endsAt`), so the *displayed* time is never wrong. But the actual "done" sound + `Notification` only fire from a React `useEffect` driven by `setInterval` ticks or a `visibilitychange` resync — both are throttled or fully suspended by the OS when the tab/PWA is backgrounded. A timer that finishes while minimized gives no alert at all until the owner manually reopens the app.

Researched and ruled out the API built for exactly this without a server (Notification Triggers / `showTrigger`): Google officially abandoned its development ("wasn't clear we could provide consistent and reliable experiences across platforms"), it's Chrome-experimental-flag-only, never shipped broadly, not viable for production. Web Push is the only architecture that reliably survives true backgrounding on Android — a service worker holds a push subscription, the server sends a payload at the right moment, Android's push stack (FCM under the hood) wakes the service worker to show a notification even with the app fully closed. This is standard for TWA too — same Chrome engine, no special TWA restriction.

Zero push infrastructure exists in this repo today: no VAPID keys, no subscription storage, no `push` handler in `public/sw.js`, no server-side scheduling. This is a new feature end to end.

## Approach

**Data model.** Two new Mongo collections:
- `PushSubscription`: `userId`, `endpoint`, `keys` (p256dh/auth), `deviceLabel`. Upserted by `endpoint` on subscribe, so re-subscribing the same browser/device updates rather than duplicates.
- `Timer`: `userId`, `recipeId`, `label`, `endsAt`, `pushSent`. Mirrors every timer the owner starts (cook-mode or a standalone step timer) — not scoped to an active cook session.

**Backend flow.**
- `POST /push/subscribe` stores a `PushSubscription` (upsert by endpoint). `POST /push/unsubscribe` removes it.
- `POST /timers` on timer start, `DELETE /timers/:id` on cancel/pause/manual-stop/completion — mirrors client timer lifecycle server-side.
- A `setInterval` sweep (~5s, no new scheduling dependency — this app has none yet and one query isn't worth adding one) finds `Timer` rows past `endsAt` with `pushSent: false`, sends a push via the `web-push` npm package (VAPID-signed) to every `PushSubscription` for that `userId`, then marks `pushSent: true`. Matches the existing `jobs` module's "sweep due/stale work on an interval" precedent already in this codebase.
- If `web-push` reports a subscription as gone (410), that `PushSubscription` row is deleted — it's permanently dead, no point retrying it. Any other send failure (network blip, transient FCM error) leaves `pushSent: false` so the next sweep cycle retries; it does not delete the subscription or give up.
- `Timer` rows are deleted once removed/completed client-side — no unbounded growth, no cross-request scheduling to reconcile beyond the 5s sweep window.

**Frontend flow.**
- Starting ANY timer (cook-mode step timer or a standalone one) requests `Notification` permission if not yet granted/denied, and calls `registration.pushManager.subscribe(...)` with the VAPID public key if granted. If permission is denied, timers work exactly as they do today — foreground sound/notification only, no crash, no blocking.
- Every timer start mirrors to `POST /timers`; every cancel/pause/removal mirrors to `DELETE /timers/:id`. Local sound/localStorage/countdown logic is unchanged — this is additive, not a replacement.
- `public/sw.js` gets a `push` event handler (`self.registration.showNotification(...)`) and a `notificationclick` handler that focuses/opens the app to the recipe being cooked.

**Delivery tolerance.** Push delivery isn't instant or guaranteed-to-the-millisecond (FCM typically delivers within a few seconds, occasionally longer under battery-saver/Doze). A few seconds of slack past `endsAt` is acceptable — matches what push realistically guarantees; achieving tighter timing would need native-app-level OS integration this web app doesn't have.

**Multi-device.** A push is sent to every `PushSubscription` the signed-in user has (all devices/browsers that granted permission), not just the most-recently-active one — simplest to build and reason about, and correct even if the owner is cooking on a device other than the one they last touched.

## Data Flow

1. Owner starts a timer (any timer, any screen) → permission requested if needed → subscribed if granted → `POST /timers` stores `{userId, recipeId, label, endsAt}`.
2. Sweep (every ~5s) finds due, unsent `Timer` rows → sends push to every `PushSubscription` for that `userId` via `web-push` → marks `pushSent: true` → deletes any subscription that reported 410.
3. Android/Chrome wakes the service worker on push arrival → `push` handler shows the OS notification → tapping it (`notificationclick`) focuses/opens the app to that recipe.
4. Timer cancel/removal/completion (client-side) → `DELETE /timers/:id`.

## Error Handling

- Push subscribe fails or is denied → timers keep working exactly as today, foreground-only.
- `web-push` send fails with 410 Gone → delete that `PushSubscription`.
- `web-push` send fails any other way → leave `pushSent: false`, retried next sweep.
- No timer sync call (subscribe, `POST /timers`, `DELETE /timers/:id`) ever blocks or fails the local timer UX — all are fire-and-forget from the frontend's perspective, same tolerance-for-failure posture as this app's existing `activityLog.record()` calls.

## Testing

Backend (Jest): subscribe/unsubscribe endpoint tests (upsert-by-endpoint behavior), timer create/delete endpoint tests, and the sweep's core logic — finds due unsent timers, sends via `web-push`, marks `pushSent`, deletes the subscription on 410, leaves `pushSent` false on other errors. Frontend: no test framework in this repo (established precedent) — manual verification only: start a timer, background the app, confirm the push notification arrives and tapping it opens the right recipe; deny permission and confirm timers still work normally; verify a second device/browser also receives the push.

## Out of Scope

- Any change to the 20dvh/collapsed CookDock UI, PiP behavior, or the existing foreground sound/Notification logic (separate, already-fixed issue).
- iOS Safari push support (out of scope — this app targets Android/Chrome per its TWA deployment; iOS Web Push has different, more limited platform support that would need its own investigation).
- Push notifications for anything other than timer completion (no general-purpose push infrastructure beyond what timers need, though `PushSubscription` storage could be reused later).
