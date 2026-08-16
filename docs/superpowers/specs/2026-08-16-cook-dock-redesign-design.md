# Cook Dock Redesign — Design

## Goal

Twelve usability fixes to the global cook-mode dock (`CookDock`/`useCookSession`/`App.tsx`), grouped into six themes: layout/positioning, Start-cooking button states, pause/resume, timer consolidation, step-content display, and a mid-recipe-start fix. Builds directly on the already-shipped global cook session feature.

## Background

`CookDock` renders globally from `App.tsx` whenever `useCookSession()` reports an active session, alongside the older `TimerPanel`/`useTimers()` (a separate, always-on kitchen-timer feature unrelated to cook sessions). `RecipeDetail`'s "Start cooking" button and the dock's own collapsed/expanded views currently have several rough edges this redesign fixes.

## A. Layout & positioning

- **Collapsed dock**: gains rounded top-left/top-right corners (matching this codebase's existing bottom-sheet radius convention, e.g. `rounded-t-2xl`).
- **Expanded dock**: currently `h-[90dvh]` (`bottom-0`), leaving a sliver of the page visible above it. Changes to reach exactly the bottom of the fixed Nav bar (`h-14`) — full viewport height minus the nav, so nothing behind it is visible while expanded.
- **Reserved space, app-wide**: `App.tsx` measures the collapsed dock's actual rendered height the same way it already measures `timerBarHeight` for the old `TimerPanel` (a `ref` + `ResizeObserver`, stored in state). This becomes a new measured value — call it `cookDockBarHeight` — passed down (as a prop, or read from `useCookSession()`'s return value, whichever is more natural at each call site) to every fixed-bottom sheet in the app so it can offset its own `bottom` by that amount while a cook session is active:
  - `RecipeDetail`'s inline actions (kebab) menu (mobile bottom-sheet variant).
  - The shared `ActionsMenu.tsx` component (used on recipe cards, e.g. in `CollectionsPage`).
  - `TimerPanel` itself (see section D — it's kept, filtered, and needs to stack above the collapsed dock rather than under it).
  - Zero offset (unchanged behavior) when no cook session is active.

## B. Start-cooking button states

`RecipeDetail`'s Start-cooking button (currently: pan emoji + "Start cooking"/"Cooking..." text, disabled whenever *any* session is active) becomes three distinct states, keyed off `isActiveCookingRecipe` (`id === cookSession.activeRecipeId`) and `cookSession.cookSessionActive`:

1. **No session active anywhere**: "Start cooking" label, no pan emoji, a play icon (▶) on the trailing edge of the button. Click starts a session (unchanged `openWizard` call).
2. **Cooking THIS recipe** (`isActiveCookingRecipe`): label is "Pause cooking" while the session is running, "Continue cooking" while paused (see section C). Click toggles pause/resume — this is new behavior for this button; previously it was inert (disabled) whenever any session was active.
3. **Cooking a DIFFERENT recipe** (`cookSessionActive && !isActiveCookingRecipe`): button renders disabled with its normal "Start cooking" label (not "Cooking...", which was the old, recipe-unscoped bug), plus a small (i) info icon next to it reusing the existing `FilterInfoPopover` component — tapping it shows a short explanation naming the recipe currently being cooked.

This also fixes the existing bug where `disabled={cookSession.cookSessionActive || cookSession.startingCook}` and the "Cooking..." label applied regardless of which recipe was active — both become scoped to `isActiveCookingRecipe`.

## C. Pause / resume

The elapsed-time stopwatch (currently local `useState`/`useRef` inside `CookDock`, driven by `elapsedBaselineMs`) moves up into `useCookSession`, since it must be pausable from the `RecipeDetail` page button (outside the dock) and auto-resumed by dock/PiP interactions (inside the dock, and in `useCookSession`'s own handler functions).

New state in `useCookSession`: `pausedAt: number | null` (timestamp, or `null` when running) and `totalPausedMs: number` (running total of all paused durations this session). Effective elapsed time is computed as:

```
now = paused ? pausedAt : Date.now()
elapsedMs = now - sessionStartMs - totalPausedMs
```

`pauseCooking()` sets `pausedAt = Date.now()`. `resumeCooking()` adds `Date.now() - pausedAt` to `totalPausedMs` and clears `pausedAt`. A shared `resumeIfPaused()` (no-op when not paused) is called at the top of every existing interaction handler that represents "the user is actively cooking" — `onPrev`/`pipPreviousStep`, `onAdvance`/`advanceWizardOrFinish`, `handleWizardMarkDone`, `handleStepEntered`, `startTimer`, `pipNextStep` — so any interaction (dock or PiP) implicitly resumes a paused session.

**Scope**: pausing only freezes the elapsed-time stopwatch. Any currently-running kitchen timer (started via `onStartTimer`) is unaffected and keeps counting down — timers are a separate concern from the cook-session clock.

**Controls**: both the `RecipeDetail` page button (section B, state 2) and a new Pause/Continue control inside the dock itself (collapsed and/or expanded — implementation detail, likely the collapsed bar's elapsed-time area becomes tappable, and the expanded header gets an explicit button) can pause/resume.

## D. Timer consolidation

`TimerPanel`/`useTimers()` is **kept**, not deleted, but scoped: it renders only timers that do **not** belong to the recipe currently being cooked (`t.recipeId !== cookSession.activeRecipeId`, or unconditionally when no session is active — unchanged from today). This avoids ever showing the same timer twice (once in `TimerPanel`, once in the dock) while still surfacing genuinely unrelated standalone timers (e.g. one left running from a different recipe browsed earlier). When active, it stacks above the collapsed dock per section A's reserved-space mechanism.

The actively-cooked recipe's own nearest timer (`cookSession.nearestTimer`, already filtered to `t.recipeId === recipe?.id`) becomes the dock's sole UI for that timer:

- Visually bigger `TimerRing` than the current small collapsed-bar version, with an added text label identifying what it's timing (e.g. the truncated instruction of the step it was started from — `existingTimer`/`getTimerForStep` already resolve this per-step).
- Shown in **both** the collapsed bar (as today, enlarged) and, new, the **expanded** step screen (today the expanded view has no timer display at all unless the user scrolls to the specific step tied to it).

## E. Step content display

Both the collapsed bar's label and the expanded header currently show `"Step X of Y"` (or the ingredients-checklist label). This is replaced with the actual (truncated) step instruction text in both places. The expanded step screen's main content (full instruction, image, tip, mark-done/timer/prev/next actions) is unchanged — it already shows real content, just the small header/collapsed label needed this fix.

**Mid-recipe start**: `startCookingNow` already computes the correct starting `wizardIndex` (first unchecked step) from the page's checked-state at the moment "Start cooking" is clicked. The gap is that `CookDock`'s initial `screen` state (`'checklist' | 'steps'`) is currently computed purely from `checkedIngredients`, ignoring `checkedSteps` — so a session that should resume mid-recipe still opens on the ingredients checklist. Fix: if any step is already checked when the dock mounts fresh (not a cross-device resume, which already lands correctly via `discoverActiveSession`'s own step-position logic), initialize `screen` to `'steps'` directly, skipping the checklist screen.

No backend/schema change: whether a session "started mid-recipe" is already fully recoverable from existing `CookSession.steps[]` data (the first logged step's `stepNum` won't be 1) for any future stats/analytics use — this design doesn't add a dedicated field for it.

## F. Dock starts collapsed on resume

Verified against existing code: `startDockExpanded` (which controls whether a freshly-mounted `CookDock` opens expanded) is only ever set `true` by `startCookingNow` (a deliberate, page-triggered "Start cooking" click) and the same-recipe-resume branch of `startCookingWithConflictCheck`. Cross-device/page-refresh resume (`discoverActiveSession`, called from `RecipeDetail`'s mount effect on any page) never touches it, so a resumed session already mounts the dock collapsed. This item requires no new code — verified during implementation, not built.

## Data Flow

- `useCookSession()` gains: `pausedAt`, `totalPausedMs` (or a derived `paused: boolean` + `elapsedMs`), `pauseCooking()`, `resumeCooking()`.
- `App.tsx` gains a `cookDockBarHeight` measurement (mirroring the existing `timerBarHeight` pattern) and passes it to `TimerPanel` (for its own offset) and down to wherever `RecipeDetail`'s actions menu / `ActionsMenu.tsx` need it.
- `CookDock` receives the moved-up pause state/actions as new props, drops its local `elapsedSeconds`/`elapsedStartRef`, and gains the bigger/labeled timer display, the corrected initial `screen`, and the rounded/full-height CSS changes.
- `RecipeDetail`'s Start-cooking button block is rewritten for the three-state logic (section B), using `FilterInfoPopover` for state 3.
- `TimerPanel` gains a filter excluding the actively-cooked recipe's timers, and a `bottom` offset when a session is active but the timers it's showing belong to other recipes.

## Testing

No test framework exists for this codebase's frontend (established precedent) — `npm run build` + eslint clean is the bar. Manual verification: rounded collapsed corners; expanded dock fully covers to the nav bar; opening the recipe actions menu while a session is active shows it stacked above the collapsed dock; the three Start-cooking button states on the right recipes; pause via the page button freezes elapsed time, any dock interaction resumes it; a standalone timer for a different recipe still shows in `TimerPanel` positioned above the collapsed dock, while the cooked recipe's own timer shows enlarged in the dock (collapsed and expanded); collapsed/expanded labels show step text not "Step X/Y"; starting a session with some steps pre-checked jumps straight to the first unchecked step; refreshing the page mid-cook shows the dock collapsed.

## Out of Scope

- Any change to cook-session server/API behavior (Phase C/D/F mechanisms untouched) beyond what section E already establishes is unnecessary.
- Pausing kitchen timers (explicitly elapsed-time-only per your answer).
- A dedicated "started mid-recipe" backend field — derivable from existing data if ever needed.
- Redesigning `ActionsMenu.tsx`/kebab menus beyond the bottom-offset fix.
