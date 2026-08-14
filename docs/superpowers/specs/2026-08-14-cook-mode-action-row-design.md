# Cook Mode Redesign — Phase A: Action Row — Design

## Goal

First of several phases redesigning the recipe page's guided-cook experience (full breakdown below). This phase only touches the action buttons on `RecipeDetail.tsx`: replace the "Made it" manual toggle and the separate "Guided mode" button with a single "Start cooking" button, and relocate the Favorite button into the hero image's top-right button group as an icon-only toggle. No backend changes, no cook-session tracking yet.

## Background

The user's full request is a large, multi-part redesign of cook mode (movie-start framing, an automatic cooked-counter tied to session completion, a persistent bottom dock replacing the fullscreen wizard, Redis-backed live session logging with permanent persistence on finish, cross-device session continuity, a recipe history/analytics page, cook-conflict warnings, an unmeasured ingredient-checklist step, and a post-cook review nudge with a next-day reminder). This was too large for one spec and was decomposed into phases:

- **Phase A (this spec):** action-row UI changes — no dependencies.
- **Phase B:** the cook-session bottom dock (replaces the fullscreen wizard modal), purely client-side.
- **Phase C:** session-tracking backend (live progress logging + permanent persistence on finish) — the foundation the remaining phases need.
- **Phases D–H (each their own future spec, after C exists):** cross-device continuity, automatic cooked-counter with a cooldown, cook-conflict handling, post-cook review nudge + reminder, recipe history/analytics page.

Today, `RecipeDetail.tsx` has three separate, overlapping entry points/actions around cooking:
1. A "Made it" button (`toggleCooked`/`cookedSlugs` from `useCookedRecipes`) — a manual toggle that increments `recipe.cookCount` server-side, unrelated to whether guided mode was ever opened.
2. A small "Guided mode" button in the steps section (`openWizard()`) — opens the fullscreen step-by-step wizard.
3. A separate Favorite button in the action row, with a text label.

## Approach

Straight UI consolidation, no new state machines or backend calls:

- **Start cooking button** takes the "Made it" button's position in the action row and its role is entirely different: clicking it calls the existing `openWizard()` (same function the old "Guided mode" button called) instead of toggling a manual cooked flag. The old "Guided mode" button in the steps section is deleted — "Start cooking" is now the only entry point into guided mode.
- **Automatic cooked-counting is explicitly out of scope for this phase.** Clicking "Start cooking" does not mark the recipe as cooked, does not touch `cookedSlugs`, and does not call `toggleCooked`. That logic depends on session-completion tracking, which doesn't exist until Phase C/E. The existing `recipe.cookCount` badge (a small `(N)` next to the label) is preserved and moves with the button — it still reads the same field, just displayed next to different button text.
- **`useCookedRecipes`/`cookedSlugs`/`toggleCooked` are removed from `RecipeDetail.tsx`'s imports and call sites** (no more manual "mark as cooked" UI exists anywhere in the app after this phase). The hook file (`src/hooks/useCookedRecipes.ts`) is left in place, unused, rather than deleted — Phase E's automatic-counting logic is an already-agreed follow-up (not speculative), and will very likely reuse this exact hook's shape (a per-recipe cooked-state toggle keyed by user), so deleting and later recreating it would be pure churn. This is a deliberate, explicit exception to "no dead code," justified by the concrete near-term follow-up phase.
- **Favorite button** moves from the action row (where it currently sits with a text label, gated on `isViewingPublishedContent`) into the hero image's top-right floating button group — the same row that already unconditionally renders and currently holds the conditional Publish/Delete buttons and the always-present "..." overflow menu trigger. Favorite is inserted immediately before that "..." trigger, same `isViewingPublishedContent` gating as today, icon-only (no text), heart filled amber when favorited (matches today's color logic), outline when not.

## Button Behavior

"Start cooking" click sequence:
1. A right-to-left fill animation plays across the button for ~0.6s — a `::before`-style overlay anchored to the button's end edge, animating `width: 0 → 100%` (respecting RTL: visually right-to-left in both LTR and RTL layouts, i.e. the fill always sweeps from the button's trailing edge toward its leading edge). Purely decorative — a brief "ignition" beat evoking a movie starting, not a hold-to-confirm gesture. The button is not disabled during the animation; there's nothing to wait for functionally.
2. `openWizard()` fires (same as today — picks the first unchecked step, opens the fullscreen wizard). No change to `openWizard()`'s own behavior in this phase.

## Integration Point

`src/components/RecipeDetail.tsx`:
- Action row (~line 1302-1321): "Made it" button block replaced with the new "Start cooking" button. Same `isViewingPublishedContent` gate as today.
- Steps section (~line 1531-1543): the small "Guided mode" button block is deleted entirely.
- Hero top-right group (~line 824, unconditionally-rendered wrapper div): new icon-only Favorite button inserted as the last child before the existing `ActionsMenu` ("...") component.
- Action row (~line 1323-1335): old text-label Favorite button block deleted (moved, not duplicated).
- `useCookedRecipes` import and its `cookedSlugs`/`toggleCooked` destructuring removed from the component.

## Testing

No backend changes, so no API tests. Manual verification: "Start cooking" opens the wizard on the correct first-unchecked step (unchanged logic), the fill animation plays once per click without blocking the click, the old "Guided mode" button is gone, Favorite toggles correctly from its new position in both LTR and RTL, and `npm run build`/lint pass.

## Out of Scope (deferred to later phases)

- Automatic cooked-counting, cooldown logic (Phase E).
- The bottom dock / any change to guided mode's own UI (Phase B).
- Session tracking, Redis, persistence, cross-device sync, conflict warnings, review nudges, analytics (Phases C–H).
