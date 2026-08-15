# Global Cook Session + Dock Polish — Design

## Goal

Make the cook-mode dock visible on every page while a cook is active, not just the recipe's own page. Two small dock polish fixes bundled in.

## Background

`CookDock` and every piece of its state (`cookSessionId`, `cookSessionActive`, `wizardIndex`, `checkedSteps`, `checkedIngredients`, the Phase D sync/discovery/5s-poll effects, `openWizard`/`advanceWizardOrFinish`/`stopCooking`/`handleStepEntered`) live locally inside `RecipeDetail.tsx`, rendered conditionally on `cookSessionActive`. Navigating away from the recipe's own page unmounts the dock entirely — only the separate `BackgroundCookStatus` (PiP/OS-notification) mechanism keeps working, and even that unmounts too, since it's also rendered inside `RecipeDetail`. This is a real, previously-unnoticed gap: PiP was meant to work regardless of what the user does, but currently breaks the moment they navigate to a different page on the same device mid-cook.

`useTimers()`/`TimerPanel` already solve this exact problem for a different feature: `useTimers()` is called once in `App.tsx`, its state passed down as props to whichever page needs it (`RecipeDetail` receives `timers`/`onAddTimer`/etc. as props, it doesn't call `useTimers()` itself), and `TimerPanel` renders once, globally, in `App.tsx` alongside the routed page content. This is the pattern to mirror.

## Approach

**`useCookSession()`** — a new hook, called once in `App.tsx`, owning everything currently local to `RecipeDetail`'s cook-session block. It independently fetches the currently-cooking recipe's data via the existing `useRecipe(id)` hook (already reactive to an `id` that can change — reused as `useRecipe(activeRecipeId)`, where `activeRecipeId` is the session's `recipeId` or `undefined` when no session is active), so it works regardless of which page is currently showing.

**Checked-state ownership (the one real subtlety):** `checkedSteps`/`checkedIngredients` currently live in `RecipeDetail` and get shared with `CookDock` via props. Since the dock can now outlive `RecipeDetail` being mounted at all, `useCookSession()` must own this state instead — but only for the recipe currently being cooked. `RecipeDetail`'s own inline ingredient/step checklist (a normal page feature, independent of whether a cook session is active) uses the shared global state when `id === activeRecipeId` (viewing the recipe you're actively cooking — checking a box in either place shows up in both, live), and falls back to its own local `sessionStorage`-backed state (unchanged from today) for any other recipe.

**`BackgroundCookStatus` moves too**, for the same reason — it's currently `RecipeDetail`-scoped and unmounts on navigation, which silently breaks PiP for exactly the case this whole redesign exists to support (seamless movement between devices/pages while cooking). It renders globally in `App.tsx` alongside `CookDock`.

**The step-photo lightbox** `CookDock` opens (via `onOpenLightbox`) currently reuses `RecipeDetail`'s own lightbox state/UI. Since that's no longer guaranteed to be mounted, the global cook-session mount point gets its own small, self-contained lightbox instance — not shared with `RecipeDetail`'s.

**`RecipeDetail.tsx`'s "Start cooking" button** calls a `openWizard(recipe.id)` function passed down from `App.tsx`'s `useCookSession()`, instead of owning any session logic itself. Everything else currently local to `RecipeDetail`'s cook-session block (all ~10 effects, all the functions) is deleted from that file — net code reduction, not addition.

**Multiplier:** stays whatever `RecipeDetail` already computes when the dock happens to be showing on the cooking recipe's own page; defaults to 1× (no serving-size scaling) when shown anywhere else, since there's no scaling UI to inherit elsewhere.

## Dock Polish (bundled, same files)

1. **Collapsed-state chevron repositioned:** currently sits inline in the collapsed bar's flex row, between the step-label text and the timer ring. Moves into its own centered strip at the top of the collapsed bar — the same treatment the expanded state's collapse-chevron already got in an earlier phase (a small drag-handle-style strip), applied symmetrically to the collapsed state too.
2. **"Stop cooking" becomes an outline button:** currently plain text (`text-cream/60 hover:text-cream/90`, no border). Switches to this codebase's existing `btn-ghost` outline-button convention (already used for every "Cancel" button in the app: `border: 1px solid rgb(var(--color-tint) / 0.12)`, transparent background, hover shifts to amber border/text) — sized down to fit the dock header's compact row rather than using the full `btn-ghost` padding.

## Data Flow

1. `App.tsx` calls `useCookSession()` once, gets back `{ cookSessionActive, activeRecipeId, wizardIndex, checkedSteps, checkedIngredients, openWizard, advanceWizardOrFinish, stopCooking, handleStepEntered, ... }` (the full set `CookDock` and `RecipeDetail`'s inline checklist both need).
2. `App.tsx` renders `<CookDock>` and `<BackgroundCookStatus>` globally, passing this state directly — same tree position as `TimerPanel`.
3. `App.tsx` passes `openWizard` (and, when `id === activeRecipeId`, the shared checklist state/setters) down to `<RecipeDetail>` as additional props, alongside the existing timer props.
4. `RecipeDetail`'s "Start cooking" button calls `openWizard(recipe.id)`. Its inline checklist reads/writes the shared state when it's the actively-cooked recipe, its own local state otherwise.

## Testing

No test framework exists for this codebase's frontend (established precedent across this entire redesign) — `npm run build` + eslint clean is the bar. Manual verification: start cooking, navigate to a different page, confirm the dock is still visible and functional there; confirm PiP still triggers correctly on tab backgrounding regardless of which page is showing; confirm the recipe's own inline checklist and the dock's checklist stay in sync while both are visible on the recipe's own page; confirm a *different* recipe's page shows its own independent, unaffected checklist state while a session is active elsewhere.

## Out of Scope

- Any change to the cook-conflict warning (Phase F) — starting a session on a different recipe while one's active elsewhere still works exactly as it does today, just now checked/triggered from wherever `openWizard` is called rather than `RecipeDetail`-locally.
- Any change to cross-device resume/sync (Phase D) — unaffected, still server-driven the same way.
- Any change to what data the dock or checklist track — this is a state-ownership relocation, not a feature change.
