# Cook Mode Redesign — Phase B: Persistent Cook Dock — Design

## Goal

Replace the fullscreen wizard modal (`RecipeDetail.tsx`'s `wizardOpen` full-page overlay) with a persistent, non-floating bottom dock: collapsed to 1/5 of the viewport height by default while a cook session is active, expandable to 90% height on tap or swipe. All client-side - no backend calls, no new persistence. Second of several phases redesigning cook mode (see Phase A, already shipped: `docs/superpowers/specs/2026-08-14-cook-mode-action-row-design.md`).

## Background

Today, starting guided mode (`openWizard()`, called by Phase A's "Start cooking" button) mounts a `fixed inset-0 z-[60]` fullscreen div: a header (step label + minimize + close buttons), a thin progress bar, the current step (number/checkbox/instruction/image/tip/inline timer-start button), and Prev/Next/Finish footer buttons. `wizardOpen` controls whether this fullscreen view is mounted; `cookSessionActive` (added alongside it) survives the view being minimized and drives `BackgroundCookStatus.tsx` - a hidden canvas-fed `<video>` that auto-enters Picture-in-Picture and an OS Notification when the tab is backgrounded (`visibilitychange`), with Media Session action handlers (play/pause toggles the nearest running timer, prev/next-track moves a step). A manual button in the fullscreen header also force-enters PiP on click.

Timers (`useTimers`/`TimerPanel`) are a separate, pre-existing feature - a global fixed-bottom bar independent of the wizard's own step navigation, both coexist today.

The ingredient checklist exists today only on the regular (non-wizard) recipe page, as its own card with click-to-check items (`checkedIngredients` state) - it is not part of the guided-mode flow at all.

## Approach

Extract a new `CookDock.tsx` component (mirroring how `BackgroundCookStatus.tsx` is already its own file) that replaces the fullscreen-modal JSX block entirely. `RecipeDetail.tsx` keeps owning the state (`cookSessionActive`, `wizardIndex`, `checkedSteps`, `checkedIngredients`) and passes it down as props, same ownership pattern as today.

Two states, one component:

- **Collapsed** (default whenever `cookSessionActive`): `fixed bottom-0 inset-x-0` bar reserving real layout height (not floating over content - the page's own bottom padding accounts for it, same pattern already used for the existing `TimerPanel`/`timerBarHeight`). Height: 1/5 of viewport height on mobile (`h-[20dvh]`-equivalent, computed via a small hook or CSS), a shorter fixed height on desktop (~96px, `sm:h-24`). Content: current step's short label on the left, elapsed cook time in the top-left corner, and on the right a circular SVG progress ring for the nearest-ending *running* timer (same "soonest to finish among running, else soonest among all" selection `BackgroundCookStatus` already uses) with its remaining time centered inside, formatted via a new helper (2-digit `HH:MM` once ≥1 hour remains, else 2-digit `MM:SS` - today's existing `formatSeconds` in `src/utils/format.ts` doesn't zero-pad minutes or handle hours, so this is a new function, not a reuse). When no timer is running, the ring is omitted entirely (not greyed/placeholder) and the step-label/elapsed-time content reflows to use the freed width. Tapping the ring calls the existing timer-toggle (pause/resume), matching the pause/resume-on-click behavior already specified for the PiP widget. An up-chevron affordance on the bar signals it expands.
- **Expanded** (90dvh height, same bottom-anchored sheet): header with a down-chevron (same toggle) + "Step X of N" label, thin progress bar, then the step content itself - number/checkbox/instruction/image/tip/inline "start timer" button, Prev/Next/Finish footer. Functionally identical to today's fullscreen step view, just constrained to 90% height with its own internal scroll if content overflows. A stop/✕ control here is the **only** way to end the session entirely - collapsing (tap or swipe-down) is always just a resize, never destructive.

**Transitions:** tap anywhere on the collapsed bar (or the expanded header's chevron) toggles state. Swipe up expands, swipe down collapses - implemented as a plain touch-event drag with a live transform during the gesture (same approach as the existing sidebar swipe-to-close: track touch start/move/end, apply an inline `transform: translateY()` while dragging, snap to the target state and clear the inline style on release), not a physics/spring library.

**Ingredient checklist as step 1:** the guided flow's first screen (both the collapsed step-label text and the expanded content) is the same ingredient checklist already rendered on the main recipe page, reusing the existing `checkedIngredients` state (checking an item in cook mode updates the same state the regular ingredients card reads, and vice versa - no duplicated state). This screen is excluded from the "Step X of N" count (numbering starts at the first real instruction step) and from the elapsed-time stopwatch (the stopwatch - a simple `Date.now()`-based client-side clock, no backend - starts only when the user advances past the checklist into step 1 of the real instructions).

**PiP/notification:** unchanged in trigger mechanism (still automatic on `visibilitychange`). The manual "force-enter PiP" button in today's fullscreen header is deleted - the dock's own always-visible collapsed state now covers what that button was for. PiP remains the fallback specifically for when the app is backgrounded (tab hidden / app minimized), which an in-page dock cannot help with regardless of its own open/collapsed state.

## Data Flow

1. `openWizard()` (unchanged trigger, called by Phase A's "Start cooking" button) sets `cookSessionActive = true` and picks the starting screen: the ingredient checklist if any ingredient is still unchecked, otherwise the first unchecked instruction step (mirrors today's "resume at first unchecked step" logic, extended to check the checklist first).
2. `CookDock` renders collapsed by default once mounted (`cookSessionActive` true). An internal `expanded: boolean` state (owned by `CookDock`, not lifted to `RecipeDetail`) controls which of the two layouts renders - `RecipeDetail` doesn't need to know whether the dock is collapsed or expanded, only whether a session is active at all.
3. Step navigation (Prev/Next/Finish), the checklist screen, and timer start/pause all call back up to the same handlers `RecipeDetail.tsx` already owns today (`setWizardIndex`, `markStepChecked`, `toggleIngredient`, `startTimer`, `toggleTimer`) - `CookDock` is a presentation/gesture layer over existing state, not a new state owner.
4. Finishing (the expanded view's Finish button on the last step) sets `cookSessionActive = false`, same as the stop/✕ control - both end the session; Finish additionally marks the last step checked (unchanged from today's behavior).
5. `BackgroundCookStatus` keeps receiving `active={cookSessionActive && !!currentWizardStep}` exactly as today - no props change to that component in this phase beyond removing the button that called its `enterFloatingView()` handle manually (the handle itself and the automatic `visibilitychange` trigger inside `BackgroundCookStatus` are untouched).

## Layout / Reserved Space

Like the existing `TimerPanel`'s `timerBarHeight` (measured via `ResizeObserver`, passed down so other fixed-bottom content doesn't overlap it), the collapsed dock's height needs to be accounted for by the page so its content isn't hidden underneath. Reuse the same measurement pattern: measure the dock's actual rendered height and feed it into the existing bottom-padding mechanism `RecipeDetail.tsx` already uses for `timerBarHeight` (both the dock and the timer bar can be bottom-anchored siblings; total reserved space = dock height + timer bar height when both are present).

## Testing

No backend changes, so no API tests. Manual verification: dock appears collapsed immediately on "Start cooking", shows the ingredient checklist first (unmeasured, no step count), advancing into real steps starts the elapsed-time clock and step counting, tap/swipe-up expands to 90%, tap/swipe-down collapses, the timer ring shows the nearest running timer and hides when none is running, tapping the ring pauses/resumes, the stop control (expanded-only) ends the session, backgrounding the tab still enters PiP/shows the notification with no in-page button needed, `npm run build`/lint pass.

## Out of Scope

- Session-tracking backend, Redis, permanent persistence (Phase C).
- Cross-device continuity (Phase D).
- Automatic cooked-counter/cooldown (Phase E).
- Cook-conflict warning when starting a new session elsewhere (Phase F).
- Post-cook review nudge + reminder (Phase G).
- Recipe history/analytics page (Phase H).
