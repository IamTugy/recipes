# Cook Mode Redesign — Phase A: Action Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Made it" manual-cooked toggle and the separate "Guided mode" button with a single "Start cooking" button (right-to-left fill animation on click, then opens guided mode), and relocate Favorite to an icon-only button in the hero top-right group next to the "..." menu.

**Architecture:** Pure UI change in one file, `src/components/RecipeDetail.tsx`. No new components, no backend calls, no new state beyond a local animation-trigger boolean. The fill animation is a CSS keyframe on a pseudo-element-style overlay `<span>`, triggered by adding/removing a class on click.

**Tech Stack:** React 19, Tailwind CSS (utility classes + one small custom `@keyframes` block already how this app defines ad-hoc animations - check `src/index.css` for the pattern before adding).

## Global Constraints

- Single file change: `src/components/RecipeDetail.tsx` (plus `src/i18n.ts` for copy). No backend changes.
- `useCookedRecipes`/`cookedSlugs`/`toggleCooked` wiring removed from `RecipeDetail.tsx`, but `src/hooks/useCookedRecipes.ts` itself stays in the repo (unused) for a later phase - do not delete the hook file.
- The old "Guided mode" button (steps section) is deleted entirely - "Start cooking" is the only remaining entry point into guided mode, calling the same existing `openWizard()` function unchanged.
- Automatic cooked-counting is explicitly out of scope - "Start cooking" does not mark anything as cooked.
- Fill animation sweeps from the button's trailing edge toward its leading edge in both LTR and RTL (i.e. always right-to-left on screen, not "end-to-start" in the writing-direction sense) - see Task 1 Step 3 for the exact CSS.
- Existing `recipe.cookCount` badge moves with the button, same data source (`recipe.cookCount`), unchanged.
- Favorite button keeps its current `isViewingPublishedContent` gate and `favoriteSlugs`/`toggleFavorite` logic - only its position, label, and icon-only styling change.

---

## Task 1: Replace action-row buttons and relocate Favorite

**Files:**
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: existing `openWizard()` (no signature change), existing `favoriteSlugs: Set<string>` / `toggleFavorite(id: string): void` from `useFavorites()`, existing `recipe.cookCount: number | undefined`.
- Produces: nothing new consumed by other tasks (this is the only task in this plan).

- [ ] **Step 1: Read the three exact blocks being changed**

Run these to confirm current line numbers before editing (they may have shifted slightly since this plan was written):

```bash
grep -n "isViewingPublishedContent && (\|toggleCooked\|openWizard\|tx.favorite\}" /Users/tugy/git/recipes/src/components/RecipeDetail.tsx
```

You're looking for three blocks:
1. The "Made it" button (`onClick={() => id && toggleCooked(id)}`) in the action row below the source line.
2. The text-label Favorite button (`onClick={() => toggleFavorite(recipe.id)}`) in that same action row, right after the "Made it" block.
3. The small "Guided mode" button (`onClick={openWizard}`) in the steps section header.
4. The hero top-right button group - a `<div className={`print:hidden absolute top-4 ...`}>` that unconditionally renders and currently ends with the `<ActionsMenu ... />` ("...") component as its last child.

- [ ] **Step 2: Remove the `useCookedRecipes` import and destructure**

Find this line near the top of the component (around line 57):

```tsx
const { cookedSlugs, toggle: toggleCooked } = useCookedRecipes()
```

Delete it. Then find the import line:

```tsx
import { useCookedRecipes } from '../hooks/useCookedRecipes'
```

Delete it too. Do NOT delete `src/hooks/useCookedRecipes.ts` itself - only remove `RecipeDetail.tsx`'s usage of it.

- [ ] **Step 3: Add the fill-animation CSS**

Open `src/index.css` and check how existing ad-hoc animations are defined (search for `@keyframes` - there should be at least one existing example to match the style/placement convention). Add this new keyframe and class near the others:

```css
@keyframes start-cooking-fill {
  from { width: 0%; }
  to { width: 100%; }
}

.start-cooking-fill-active::before {
  content: '';
  position: absolute;
  inset: 0;
  right: 0;
  width: 0%;
  background: rgba(255, 255, 255, 0.18);
  animation: start-cooking-fill 0.6s ease-out forwards;
  pointer-events: none;
}
```

The overlay is `position: absolute` with `right: 0` and animates `width` from the right edge - this sweeps right-to-left on screen regardless of `dir="ltr"` or `dir="rtl"` on ancestors, since `right: 0` is a physical (not logical) CSS property. The button itself needs `position: relative; overflow: hidden` for this overlay to clip correctly (added in Step 4's className).

- [ ] **Step 4: Replace the "Made it" button with "Start cooking"**

Find the "Made it" button block (from Step 1, roughly):

```tsx
{isViewingPublishedContent && (
  <button type="button"
    onClick={() => id && toggleCooked(id)}
    aria-pressed={!!id && cookedSlugs.has(id)}
    title={tx.markThatYouVeActuallyCooked}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
      id && cookedSlugs.has(id)
        ? 'bg-herb text-white'
        : 'bg-amber text-bg hover:bg-amber/90'
    }`}
  >
    <span className="text-lg leading-none">{id && cookedSlugs.has(id) ? '✅' : '🍳'}</span>
    {id && cookedSlugs.has(id)
      ? (tx.madeIt)
      : (tx.markAsCooked)}
    {!!recipe.cookCount && (
      <span className="opacity-70 text-xs">({recipe.cookCount})</span>
    )}
  </button>
)}
```

Replace it with:

```tsx
{isViewingPublishedContent && (
  <button type="button"
    onClick={e => {
      const btn = e.currentTarget
      btn.classList.remove('start-cooking-fill-active')
      // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
      void btn.offsetWidth
      btn.classList.add('start-cooking-fill-active')
      openWizard()
    }}
    className="relative overflow-hidden flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90"
  >
    <span className="text-lg leading-none">🍳</span>
    {tx.startCooking}
    {!!recipe.cookCount && (
      <span className="opacity-70 text-xs">({recipe.cookCount})</span>
    )}
  </button>
)}
```

- [ ] **Step 5: Delete the old text-label Favorite button from the action row**

Immediately after the block you just replaced, find and delete this entire block:

```tsx
{isViewingPublishedContent && (
  <button type="button"
    onClick={() => toggleFavorite(recipe.id)}
    className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
      favoriteSlugs.has(recipe.id) ? 'text-amber' : 'text-cream/40 hover:text-cream/70'
    }`}
  >
    <svg className="w-4 h-4" fill={favoriteSlugs.has(recipe.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
    </svg>
    {tx.favorite}
  </button>
)}
```

(This exact block moves to Step 6 below, not duplicated - make sure it's fully removed from this location.)

- [ ] **Step 6: Add the icon-only Favorite button to the hero top-right group**

Find the hero top-right button group - the unconditionally-rendered `<div className={`print:hidden absolute top-4 ${lang === 'he' ? 'left-4' : 'right-4'} flex items-center gap-2`}>` that contains the conditional Publish/Delete buttons and ends with `<ActionsMenu ... />`. Insert this new button as the last child, immediately before `<ActionsMenu`:

```tsx
{isViewingPublishedContent && (
  <button type="button"
    onClick={() => toggleFavorite(recipe.id)}
    aria-label={tx.favorite}
    title={tx.favorite}
    className={`flex items-center justify-center h-9 w-9 rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 transition-colors ${
      favoriteSlugs.has(recipe.id) ? 'text-amber' : 'text-white/80 hover:text-white'
    }`}
  >
    <svg className="w-4 h-4" fill={favoriteSlugs.has(recipe.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
    </svg>
  </button>
)}
```

(Styled to match the existing hero-group buttons' `bg-black/40 backdrop-blur-sm border border-white/10` look, sized like the adjacent "..." trigger rather than the old text-label style.)

- [ ] **Step 7: Delete the old "Guided mode" button**

Find and delete this entire block from the steps section header (the `<div className="print:hidden flex items-center gap-2">` wrapper around it becomes empty - delete the wrapper too if it has no other children):

```tsx
{flatSteps.length > 0 && (
  <button type="button"
    onClick={openWizard}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 text-cream/40 hover:text-cream/70 transition-colors"
    title={tx.guideMeStepByStep}
  >
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    {tx.guidedMode}
  </button>
)}
```

Check the surrounding JSX after deletion - the steps-section header `<div className={\`flex items-center justify-between ${flatSteps.length > 0 ? 'mb-1' : 'mb-4'}\`}>` and its inner `<div className="print:hidden flex items-center gap-2">` wrapper may now be empty or redundant; simplify if so (don't leave an empty wrapper div), but keep the `<h2>` steps heading itself untouched.

- [ ] **Step 8: Update i18n - add `startCooking`, remove five now-dead keys**

In `src/i18n.ts`, find the Hebrew (`he`) block and add near the other action-related keys (e.g. near `markAsCooked`):

```ts
startCooking: "התחילו לבשל",
```

Then remove these five now-unused keys from the `he` block: `madeIt`, `markAsCooked`, `markThatYouVeActuallyCooked`, `guideMeStepByStep`, `guidedMode`.

Repeat for the English (`en`) block - add:

```ts
startCooking: "Start cooking",
```

And remove the same five keys: `madeIt`, `markAsCooked`, `markThatYouVeActuallyCooked`, `guideMeStepByStep`, `guidedMode`.

Before deleting each key, double-check with a repo-wide grep that nothing outside `RecipeDetail.tsx` references it (this plan's research already confirmed this, but re-verify since the codebase may have changed):

```bash
grep -rn "tx\.madeIt\|tx\.markAsCooked\|tx\.markThatYouVeActuallyCooked\|tx\.guideMeStepByStep\|tx\.guidedMode\b" /Users/tugy/git/recipes/src --include="*.tsx"
```

Expected: no output (all five are fully unused after Steps 4-7).

- [ ] **Step 9: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-check.json 2>&1 || true
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-check.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
console.log(hookIssues.length ? JSON.stringify(hookIssues, null, 2) : 'No react-hooks violations found.');
"
npx eslint src/components/RecipeDetail.tsx src/i18n.ts src/index.css 2>&1
```

Expected: "No react-hooks violations found." and no eslint errors on the touched files. (eslint doesn't lint `.css` - that command will just no-op on it silently, which is fine.)

- [ ] **Step 10: Manual verification**

Start the dev server if not already running (`npm run dev`), or verify visually via the build output. Confirm:
- "Start cooking" button appears where "Made it" used to be, plays a right-to-left fill sweep on click (check in both English/LTR and Hebrew/RTL - the sweep direction on screen should be identical in both), then opens the guided-mode wizard on the correct (first unchecked) step.
- The old small "Guided mode" button in the steps section is gone.
- Favorite now appears as a heart-only icon in the hero image's top-right corner, immediately before the "..." menu button, filled amber when favorited, toggles correctly on click.
- The old text-label Favorite button is gone from the action row.
- `recipe.cookCount` badge (if the recipe has a nonzero count) still shows next to "Start cooking".

- [ ] **Step 11: Commit**

```bash
git add src/components/RecipeDetail.tsx src/i18n.ts src/index.css
git commit -m "$(cat <<'EOF'
refactor: replace Made-it/Guided-mode buttons with Start cooking

Single "Start cooking" button replaces both the manual "Made it"
cooked-toggle and the separate "Guided mode" button - one entry
point into guided mode instead of two overlapping ones, with a
right-to-left fill animation as a decorative "ignition" beat on
click. Automatic cooked-counting is a later phase; this button
currently only opens guided mode, same as the old "Guided mode"
button did.

Favorite moves from a text-label button in the action row to an
icon-only heart in the hero image's top-right group, next to the
"..." menu.

useCookedRecipes/cookedSlugs/toggleCooked usage removed from
RecipeDetail.tsx - the hook file itself stays for a later phase's
automatic cooked-counting logic.

Phase A of the cook-mode redesign (docs/superpowers/specs/2026-08-14-cook-mode-action-row-design.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016tfmq3HyC8s6SJSC5XE1i3
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Start cooking button (merged entry point, fill animation, cookCount badge preserved) ✓ Step 4. Favorite relocation (icon-only, hero group, filled-when-liked) ✓ Step 6. Old buttons removed ✓ Steps 5/7. useCookedRecipes usage removed but hook file kept ✓ Steps 2. All covered by this single task.
- **Placeholder scan:** No TBD/TODO; all code blocks are literal, copy-pasteable.
- **Type consistency:** `openWizard()`, `toggleFavorite(id: string)`, `favoriteSlugs: Set<string>`, `recipe.cookCount: number | undefined` all used exactly as they exist in the current codebase (verified via grep before writing this plan) - no invented signatures.
