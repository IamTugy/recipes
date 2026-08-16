# Cook Dock Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Twelve usability fixes to the global cook-mode dock (rounded/full-height layout, reserved space for other UI, three-state Start-cooking button, pause/resume, timer consolidation, real step content instead of "Step X/Y", correct mid-recipe resume).

**Architecture:** Pause/resume state and the app-wide "reserved bottom space" measurement both move up into shared/global ownership (`useCookSession` and `App.tsx` respectively) since they're needed by code outside `CookDock` itself (the `RecipeDetail` page button, other fixed-bottom sheets app-wide). `CookDock`'s own render body absorbs the bigger/labeled timer, step-text labels, and the corrected initial screen. `TimerPanel` is kept (not deleted) but filtered to exclude whatever recipe is currently being cooked, since `CookDock` already owns that timer's display.

**Tech Stack:** React 18/Vite, TypeScript, Tailwind, Framer Motion. No frontend test framework in this codebase (established precedent) — `npm run build` + eslint clean is the bar, plus manual verification steps per task.

## Global Constraints

- No em dash (—) anywhere in code, comments, or copy (repo-wide rule).
- `npm run build` must succeed with zero TypeScript errors after every task.
- `npx eslint <changed files>` must show zero errors/warnings after every task.
- Follow this codebase's established SVG-icon safety practice: build icons from simple primitive shapes (`<rect>`, `<circle>`, `<line>`, `<polygon>`) or very short, easily-verified `<path>` data — never a long memorized/guessed path string.
- Work directly on `main`, no worktree, per this session's established pattern.

---

## File Structure

- **Modify `src/hooks/useCookSession.ts`** — adds pause/resume state (`pausedAt`, `totalPausedMs`, `cookingPaused`, `pauseCooking`, `resumeCooking`) and wires an internal `resumeIfPaused()` call into every existing "the user is actively cooking" interaction handler.
- **Modify `src/App.tsx`** — adds the `cookDockBarHeight` measurement (mirrors the existing `timerBarHeight` pattern) mirrored onto a CSS custom property (`--cook-dock-bar-height`) any fixed-bottom sheet can read without prop drilling; simplifies the dock's reserved-space spacer; filters `TimerPanel`'s timers to exclude the actively-cooked recipe's; threads the new pause props into `<CookDock>`.
- **Modify `src/components/CookDock.tsx`** — rounded collapsed corners, full-height expanded view, drops the now-unused `timerBarHeight` prop, adds `onCollapsedHeightChange`, replaces "Step X of Y" with real step text, fixes the initial screen for mid-recipe starts, adds the bigger labeled timer to the expanded view, adds a Pause/Continue control.
- **Modify `src/components/RecipeDetail.tsx`** — Start-cooking button becomes three states (start / pause-continue / disabled-with-info).
- **Modify `src/components/ActionsMenu.tsx`** and **`src/components/TimerPanel.tsx`** — read the new CSS custom property to stack above the collapsed dock instead of sliding underneath it.
- **Modify `src/i18n.ts`** — new keys: `pauseCooking`, `continueCooking`, `timerFor`.

---

### Task 1: Pause/resume state in `useCookSession`

**Files:**
- Modify: `src/hooks/useCookSession.ts`

**Interfaces:**
- Produces: `useCookSession()`'s return object gains `cookingPaused: boolean`, `pausedAt: number | null`, `totalPausedMs: number`, `pauseCooking: () => void`, `resumeCooking: () => void`. These are consumed by Task 3 (`RecipeDetail`'s button) and Task 4 (`CookDock`'s render body, via `App.tsx`'s prop threading).

- [ ] **Step 1: Add pause state and the pause/resume functions**

In `src/hooks/useCookSession.ts`, add this state near the other session-lifecycle state (next to `const [cookSessionStartedAt, setCookSessionStartedAt] = useState<string | null>(null)`):

```typescript
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [totalPausedMs, setTotalPausedMs] = useState(0)
```

Add these two functions near `stopCooking`/`endSessionLocally`:

```typescript
  function pauseCooking() {
    if (pausedAt !== null) return
    setPausedAt(Date.now())
  }

  // Also called internally (not just from an explicit "Continue" click) by
  // every interaction handler below, so any dock/page/PiP interaction while
  // paused implicitly resumes the elapsed-time clock. No-op when not paused.
  function resumeIfPaused() {
    if (pausedAt === null) return
    setTotalPausedMs(ms => ms + (Date.now() - pausedAt))
    setPausedAt(null)
  }
```

Add pause-state reset to `endSessionLocally` (find the existing function and add the two new resets alongside its existing ones):

```typescript
  function endSessionLocally(alsoAbandon: boolean) {
    discoveryRequestIdRef.current++
    if (alsoAbandon && cookSessionId) {
      abandonCookSession(cookSessionId, getToken)
    }
    setCookSessionActive(false)
    setCookSessionId(null)
    setCookSessionStartedAt(null)
    setActiveRecipeId(undefined)
    setSeedRecipe(null)
    setPausedAt(null)
    setTotalPausedMs(0)
  }
```

- [ ] **Step 2: Wire `resumeIfPaused()` into every active-cooking interaction handler**

Add `resumeIfPaused()` as the first line of the body of each of these existing functions (do not change anything else about them):

`toggleStep`:
```typescript
  function toggleStep(key: string) {
    resumeIfPaused()
    setCheckedSteps(prev => {
```

`markStepChecked`:
```typescript
  function markStepChecked(key: string) {
    resumeIfPaused()
    setCheckedSteps(prev => {
```

`toggleIngredient`:
```typescript
  function toggleIngredient(key: string) {
    resumeIfPaused()
    setCheckedIngredients(prev => {
```

`startTimer`:
```typescript
  function startTimer(label: string, minutes: number, groupIdx: number, stepIdx: number) {
    resumeIfPaused()
    if (!recipe) return
```

`handleStepEntered`:
```typescript
  function handleStepEntered(stepKey: string, stepNum: number) {
    resumeIfPaused()
    lastEnteredStepRef.current = { stepKey, stepNum }
```

`pipPreviousStep`:
```typescript
  function pipPreviousStep() {
    resumeIfPaused()
    const prevIndex = wizardIndex - 1
```

`pipNextStep`:
```typescript
  function pipNextStep() {
    resumeIfPaused()
    if (!currentWizardStep) return
```

`pipToggleNearestTimer`:
```typescript
  function pipToggleNearestTimer() {
    resumeIfPaused()
    if (nearestTimer) onToggleTimer(nearestTimer.id)
  }
```

- [ ] **Step 3: Expose the new fields from the hook's return object**

Find the `return { ... }` statement at the end of `useCookSession` and add `cookingPaused: pausedAt !== null, pausedAt, totalPausedMs, pauseCooking, resumeCooking: resumeIfPaused,` to it (anywhere in the object is fine — match the existing loose grouping style, e.g. next to `stopCooking`).

- [ ] **Step 4: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with zero TypeScript errors. `App.tsx`, `CookDock.tsx`, and `RecipeDetail.tsx` do not yet consume these new fields, so this task alone produces no visible behavior change — that's expected, later tasks wire them up.

Run: `npx eslint src/hooks/useCookSession.ts`
Expected: zero errors/warnings.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCookSession.ts
git commit -m "feat: add pause/resume state to useCookSession"
```

---

### Task 2: Layout, rounded corners, full-height expand, app-wide reserved space

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/CookDock.tsx`
- Modify: `src/components/ActionsMenu.tsx`
- Modify: `src/components/RecipeDetail.tsx` (only the actions-menu bottom-sheet `motion.div`, not the Start-cooking button — that's Task 3)

**Interfaces:**
- Produces: a CSS custom property `--cook-dock-bar-height` (set on `document.documentElement`, in pixels, `0` when no session is active or the dock is expanded) that any fixed-bottom element can read via `var(--cook-dock-bar-height, 0px)` with no prop drilling. `CookDock` gains a new prop `onCollapsedHeightChange?: (height: number) => void` and loses its existing `timerBarHeight` prop (no longer needed — see Step 2's rationale).
- Consumes: nothing from Task 1.

- [ ] **Step 1: `CookDock` reports its own collapsed height, drops `timerBarHeight`, gains rounded/full-height CSS**

In `src/components/CookDock.tsx`, remove `timerBarHeight: number` from the `CookDockProps` interface and add `onCollapsedHeightChange?: (height: number) => void` in its place. Remove `timerBarHeight` from the destructured props list in the component signature and add `onCollapsedHeightChange`.

Add this effect near the other `useEffect` calls (after the `useFocusTrap` line is fine):

```typescript
  // Reports the collapsed bar's actual rendered height (0 while expanded,
  // since a fully-expanded dock has nothing else visible around it to
  // reserve space for) so App.tsx can mirror it onto a CSS custom property
  // any fixed-bottom sheet elsewhere in the app can read - see App.tsx's
  // cookDockBarHeight state.
  useEffect(() => {
    if (!onCollapsedHeightChange) return
    if (expanded) {
      onCollapsedHeightChange(0)
      return
    }
    const el = dockRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      onCollapsedHeightChange(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [expanded, onCollapsedHeightChange])
```

Find the root `<div>`'s `className`/`style`:

```typescript
      className={`print:hidden fixed inset-x-0 bg-bg border-t border-tint/10 transition-[height] duration-200 flex flex-col ${
        expanded ? 'h-[90dvh] bottom-0 z-[70]' : 'h-[20dvh] sm:h-24 z-[66] cursor-pointer'
      }`}
      style={expanded ? undefined : { bottom: timerBarHeight }}
```

Replace with (rounded top corners when collapsed; expanded height reaches exactly under the fixed `h-14` Nav bar instead of leaving a gap; both states now sit at true `bottom: 0` — the old `timerBarHeight` offset is gone because the reserved-space relationship inverts in this task: `TimerPanel` now stacks *above* the collapsed dock, not the other way around, see Step 3):

```typescript
      className={`print:hidden fixed inset-x-0 bottom-0 bg-bg border-t border-tint/10 transition-[height] duration-200 flex flex-col ${
        expanded ? 'h-[calc(100dvh-3.5rem)] z-[70]' : 'h-[20dvh] sm:h-24 z-[66] rounded-t-2xl cursor-pointer'
      }`}
```

- [ ] **Step 2: `App.tsx` measures the collapsed height and mirrors it onto a CSS custom property**

In `src/App.tsx`, add state near the existing `timerBarHeight` state:

```typescript
  const [cookDockBarHeight, setCookDockBarHeight] = useState(0)
```

Add this effect near the other top-level effects:

```typescript
  // Mirrors the dock's own reported collapsed height onto a CSS custom
  // property so any fixed-bottom sheet anywhere in the app (RecipeDetail's
  // actions menu, the shared ActionsMenu, TimerPanel) can read it without
  // needing cookSession threaded down as a prop - see CookDock's
  // onCollapsedHeightChange and ActionsMenu.tsx/TimerPanel.tsx's use of
  // var(--cook-dock-bar-height, 0px).
  useEffect(() => {
    document.documentElement.style.setProperty('--cook-dock-bar-height', `${cookDockBarHeight}px`)
  }, [cookDockBarHeight])

  // The dock unmounts entirely when a session ends, so nothing would
  // otherwise reset the property back to 0 - CookDock's own effect only
  // ever reports while it's mounted.
  useEffect(() => {
    if (!cookSession.cookSessionActive) setCookDockBarHeight(0)
  }, [cookSession.cookSessionActive])
```

Find the reserved-space spacer div and the `<CookDock>` render call:

```typescript
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <div aria-hidden="true" className="h-[20dvh] sm:h-24" style={{ paddingBottom: timerBarHeight }} />
      )}
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <CookDock
          lang={lang}
          ingredients={cookSession.recipe?.ingredients ?? []}
          checkedIngredients={cookSession.checkedIngredients}
          onToggleIngredient={cookSession.toggleIngredient}
          multiplier={cookSession.multiplier}
          steps={cookSession.flatSteps}
          wizardIndex={cookSession.wizardIndex}
          onPrev={() => cookSession.setWizardIndex(i => Math.max(i - 1, 0))}
          onAdvance={key => { cookSession.markStepChecked(key); cookSession.advanceWizardOrFinish() }}
          onMarkDone={cookSession.handleWizardMarkDone}
          onStop={cookSession.stopCooking}
          onStepEntered={cookSession.handleStepEntered}
          onExpand={() => cookSession.backgroundCookStatusRef.current?.exitFloatingView()}
          checkedSteps={cookSession.checkedSteps}
          nearestTimer={cookSession.nearestTimer}
          onToggleNearestTimer={cookSession.pipToggleNearestTimer}
          getTimerForStep={cookSession.getTimerForStep}
          onStartTimer={cookSession.startTimer}
          onOpenLightbox={cookSession.setLightboxUrl}
          timerBarHeight={timerBarHeight}
          lightboxOpen={!!cookSession.lightboxUrl}
          elapsedBaselineMs={cookSession.cookSessionStartedAt ? new Date(cookSession.cookSessionStartedAt).getTime() : undefined}
          startExpanded={cookSession.startDockExpanded}
          onExpandConsumed={cookSession.onExpandConsumed}
        />
      )}
```

Replace with (spacer simplified to just the dock's own fixed height, `timerBarHeight` prop removed, `onCollapsedHeightChange` added; pause-related props are added later in Task 4, not here):

```typescript
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <div aria-hidden="true" className="h-[20dvh] sm:h-24" />
      )}
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <CookDock
          lang={lang}
          ingredients={cookSession.recipe?.ingredients ?? []}
          checkedIngredients={cookSession.checkedIngredients}
          onToggleIngredient={cookSession.toggleIngredient}
          multiplier={cookSession.multiplier}
          steps={cookSession.flatSteps}
          wizardIndex={cookSession.wizardIndex}
          onPrev={() => cookSession.setWizardIndex(i => Math.max(i - 1, 0))}
          onAdvance={key => { cookSession.markStepChecked(key); cookSession.advanceWizardOrFinish() }}
          onMarkDone={cookSession.handleWizardMarkDone}
          onStop={cookSession.stopCooking}
          onStepEntered={cookSession.handleStepEntered}
          onExpand={() => cookSession.backgroundCookStatusRef.current?.exitFloatingView()}
          onCollapsedHeightChange={setCookDockBarHeight}
          checkedSteps={cookSession.checkedSteps}
          nearestTimer={cookSession.nearestTimer}
          onToggleNearestTimer={cookSession.pipToggleNearestTimer}
          getTimerForStep={cookSession.getTimerForStep}
          onStartTimer={cookSession.startTimer}
          onOpenLightbox={cookSession.setLightboxUrl}
          lightboxOpen={!!cookSession.lightboxUrl}
          elapsedBaselineMs={cookSession.cookSessionStartedAt ? new Date(cookSession.cookSessionStartedAt).getTime() : undefined}
          startExpanded={cookSession.startDockExpanded}
          onExpandConsumed={cookSession.onExpandConsumed}
        />
      )}
```

- [ ] **Step 3: `TimerPanel` and `ActionsMenu` stack above the collapsed dock**

In `src/components/TimerPanel.tsx`, find the root element:

```typescript
    <div ref={panelRef} className="print:hidden fixed bottom-0 left-0 right-0 z-[65]">
```

Replace with (inline `style` wins over the `bottom-0` class for the same CSS property, and the `, 0px` fallback keeps this a no-op when no cook session is active, exactly matching today's behavior in that case):

```typescript
    <div ref={panelRef} className="print:hidden fixed bottom-0 left-0 right-0 z-[65]" style={{ bottom: 'var(--cook-dock-bar-height, 0px)' }}>
```

In `src/components/ActionsMenu.tsx`, find the bottom-sheet `motion.div`'s existing `style`:

```typescript
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
```

Replace with:

```typescript
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))', bottom: 'var(--cook-dock-bar-height, 0px)' }}
```

In `src/components/RecipeDetail.tsx`, find the identical bottom-sheet `motion.div`'s `style` (the inline actions/kebab menu, not the shared `ActionsMenu.tsx` component — this file has its own copy):

```typescript
                  style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
```

Replace with:

```typescript
                  style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))', bottom: 'var(--cook-dock-bar-height, 0px)' }}
```

- [ ] **Step 4: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with zero TypeScript errors.

Run: `npx eslint src/App.tsx src/components/CookDock.tsx src/components/ActionsMenu.tsx src/components/RecipeDetail.tsx`
Expected: zero errors/warnings.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, start cooking a recipe:
1. Collapsed dock has rounded top-left/top-right corners.
2. Expanding the dock: it now reaches exactly to the bottom of the top Nav bar, nothing behind it visible.
3. While the dock is collapsed, open the recipe's actions (kebab) menu on mobile width - it slides up and stops above the collapsed dock, not underneath it.
4. Confirm normal (non-cooking) pages are unaffected - the kebab menu on a recipe you're not cooking, and on `CollectionsPage`'s card menus, still sits flush at the true bottom of the screen.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/CookDock.tsx src/components/ActionsMenu.tsx src/components/RecipeDetail.tsx
git commit -m "feat: round collapsed dock corners, full-height expand, app-wide reserved bottom space"
```

---

### Task 3: `RecipeDetail` Start-cooking button, three states

**Files:**
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: `cookSession.cookingPaused`, `cookSession.pauseCooking`, `cookSession.resumeCooking` (Task 1).
- Consumes: `FilterInfoPopover` (existing component, `src/components/FilterInfoPopover.tsx`, prop `text: string`), already imported in `RecipeDetail.tsx`.

- [ ] **Step 1: Add the new i18n keys**

In `src/i18n.ts`, find `startCooking: "התחילו לבשל",` and `cooking: "מבשל...",` in the `he` block (search for `cooking: "מבשל...",`), and add two new keys right after them:

```typescript
      startCooking: "התחילו לבשל",
      cooking: "מבשל...",
      pauseCooking: "השהה בישול",
      continueCooking: "המשך בישול",
```

Find the matching `en` block (`startCooking: "Start cooking",` / `cooking: "Cooking...",`) and add the English equivalents:

```typescript
      startCooking: "Start cooking",
      cooking: "Cooking...",
      pauseCooking: "Pause cooking",
      continueCooking: "Continue cooking",
```

- [ ] **Step 2: Rewrite the Start-cooking button into three states**

In `src/components/RecipeDetail.tsx`, find this block:

```tsx
            {isViewingPublishedContent && (
              <button type="button"
                disabled={cookSession.cookSessionActive || cookSession.startingCook}
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  if (recipe) cookSession.openWizard(recipe, multiplier, checkedSteps, checkedIngredients)
                }}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="text-lg leading-none">🍳</span>
                {cookSession.cookSessionActive ? tx.cooking : tx.startCooking}
              </button>
            )}
```

Replace with (three states: not cooking anything → play icon + Start; cooking this recipe → Pause/Continue toggle, no disabled state, no fill animation since it's not a fresh-start action; cooking a different recipe → disabled Start-cooking look plus an info popover explaining why):

```tsx
            {isViewingPublishedContent && !cookSession.cookSessionActive && (
              <button type="button"
                onClick={e => {
                  const btn = e.currentTarget
                  btn.classList.remove('start-cooking-fill-active')
                  // Force reflow so re-adding the class restarts the animation on rapid re-clicks.
                  void btn.offsetWidth
                  btn.classList.add('start-cooking-fill-active')
                  if (recipe) cookSession.openWizard(recipe, multiplier, checkedSteps, checkedIngredients)
                }}
                disabled={cookSession.startingCook}
                className="relative overflow-hidden flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-amber text-bg hover:bg-amber/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {tx.startCooking}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="8,5 19,12 8,19" />
                </svg>
              </button>
            )}

            {isViewingPublishedContent && isActiveCookingRecipe && (
              <button type="button"
                onClick={() => {
                  if (cookSession.cookingPaused) cookSession.resumeCooking()
                  else cookSession.pauseCooking()
                }}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-amber/40 text-amber hover:bg-amber/10"
              >
                {cookSession.cookingPaused ? tx.continueCooking : tx.pauseCooking}
              </button>
            )}

            {isViewingPublishedContent && cookSession.cookSessionActive && !isActiveCookingRecipe && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button type="button"
                  disabled
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber text-bg opacity-60 cursor-not-allowed"
                >
                  {tx.startCooking}
                </button>
                <FilterInfoPopover text={cookSession.recipe ? tx.cookingElsewhereWarning(lang === 'he' ? (cookSession.recipe.titleHe ?? cookSession.recipe.title) : cookSession.recipe.title) : tx.alreadyCookingElsewhere} />
              </div>
            )}
```

- [ ] **Step 3: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with zero TypeScript errors.

Run: `npx eslint src/components/RecipeDetail.tsx src/i18n.ts`
Expected: zero errors/warnings.

- [ ] **Step 4: Manual verification**

1. On a recipe you're not cooking, with no session active anywhere: button reads "Start cooking" with a play icon on the right, no pan emoji.
2. Start cooking it: button now reads "Pause cooking"; click it - it flips to "Continue cooking" and the dock's elapsed time stops advancing; click again - flips back to "Pause cooking" and elapsed time resumes.
3. While cooking recipe A, navigate to a different recipe B's page: B's button is disabled, reads "Start cooking" (not "Cooking..."), with an (i) icon next to it - tapping it shows a popover naming recipe A.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeDetail.tsx src/i18n.ts
git commit -m "feat: three-state Start-cooking button (start / pause-continue / disabled elsewhere)"
```

---

### Task 4: `CookDock` render body — bigger labeled timer, real step text, corrected initial screen, pause control

**Files:**
- Modify: `src/components/CookDock.tsx`
- Modify: `src/App.tsx` (thread the new pause props into the `<CookDock>` call)
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: `cookSession.cookingPaused`, `cookSession.pausedAt`, `cookSession.totalPausedMs`, `cookSession.pauseCooking`, `cookSession.resumeCooking` (Task 1). Consumes Task 2's already-landed CSS/prop changes to `CookDock.tsx` (this task edits the same file, layered on top).

- [ ] **Step 1: Add the `timerFor` i18n key**

In `src/i18n.ts`, add to the `he` block, next to `pauseTimer`/`resumeTimer`:

```typescript
    pauseTimer: "השהה טיימר",
    resumeTimer: "המשך טיימר",
    timerFor: (label: string) => `טיימר: ${label}`,
```

Add to the `en` block, next to its `pauseTimer`/`resumeTimer`:

```typescript
    pauseTimer: "Pause timer",
    resumeTimer: "Resume timer",
    timerFor: (label: string) => `Timer: ${label}`,
```

- [ ] **Step 2: Add the new pause-related props to `CookDockProps`**

In `src/components/CookDock.tsx`, add to the `CookDockProps` interface (anywhere among the existing props is fine):

```typescript
  cookingPaused: boolean
  pausedAt: number | null
  totalPausedMs: number
  onPauseCooking: () => void
  onResumeCooking: () => void
```

Add the corresponding names to the destructured props in the component signature.

- [ ] **Step 3: Replace the elapsed-time effect to account for pausing**

Find:

```typescript
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedStartRef = useRef<number | null>(elapsedBaselineMs ?? null)
  useEffect(() => {
    if (screen !== 'steps') return
    if (elapsedStartRef.current === null) elapsedStartRef.current = Date.now()
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - elapsedStartRef.current!) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [screen])
```

Replace with:

```typescript
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedStartRef = useRef<number | null>(elapsedBaselineMs ?? null)
  useEffect(() => {
    if (screen !== 'steps') return
    if (elapsedStartRef.current === null) elapsedStartRef.current = Date.now()
    function tick() {
      const now = cookingPaused && pausedAt !== null ? pausedAt : Date.now()
      setElapsedSeconds(Math.floor((now - elapsedStartRef.current! - totalPausedMs) / 1000))
    }
    tick()
    if (cookingPaused) return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [screen, cookingPaused, pausedAt, totalPausedMs])
```

- [ ] **Step 4: Replace "Step X of Y" with real step text**

Find:

```typescript
  const collapsedStepLabel = screen === 'checklist'
    ? tx.ingredients
    : (lang === 'he' ? `שלב ${wizardIndex + 1} מתוך ${steps.length}` : `Step ${wizardIndex + 1} of ${steps.length}`)
```

Replace with (the checklist screen still shows "Ingredients" as its label - only the steps-screen "Step X of Y" phrasing goes away, replaced by the current step's own instruction text, truncated for the collapsed bar/header's limited width):

```typescript
  const currentStepText = screen === 'steps' ? steps[wizardIndex]?.instruction ?? '' : ''
  const collapsedStepLabel = screen === 'checklist' ? tx.ingredients : currentStepText
```

- [ ] **Step 5: Fix the initial screen for mid-recipe starts**

Find:

```typescript
  const allIngredientKeys = ingredients.flatMap((g, gi) => g.items.map((_, ii) => `${gi}-${ii}`))
  const [screen, setScreen] = useState<'checklist' | 'steps'>(() =>
    allIngredientKeys.some(k => !checkedIngredients.has(k)) ? 'checklist' : 'steps'
  )
```

Replace with (if any step is already checked when the dock mounts fresh, the session is resuming mid-recipe - skip straight to the steps screen regardless of ingredient-check state, since `wizardIndex` already points at the correct first-unchecked step via `startCookingNow`'s own calculation):

```typescript
  const allIngredientKeys = ingredients.flatMap((g, gi) => g.items.map((_, ii) => `${gi}-${ii}`))
  const [screen, setScreen] = useState<'checklist' | 'steps'>(() => {
    if (checkedSteps.size > 0) return 'steps'
    return allIngredientKeys.some(k => !checkedIngredients.has(k)) ? 'checklist' : 'steps'
  })
```

- [ ] **Step 6: Bigger labeled timer in the collapsed bar**

Find the collapsed-bar timer ring block:

```tsx
            {displayedTimer && (
              <button type="button"
                onClick={e => { e.stopPropagation(); onToggleNearestTimer() }}
                aria-label={displayedTimer.running ? tx.pauseTimer : tx.resumeTimer}
              >
                <TimerRing fraction={displayedTimer.totalSeconds > 0 ? displayedTimer.remainingSeconds / displayedTimer.totalSeconds : 0}>
                  {formatDockDuration(displayedTimer.remainingSeconds)}
                </TimerRing>
              </button>
            )}
```

This one stays a compact ring (collapsed-bar space is limited) - leave it as-is. The "bigger" requirement applies to the **expanded** view, added new in Step 7 below, which has room for a proper label too.

- [ ] **Step 7: Add a bigger labeled timer to the expanded step screen**

Find the expanded step screen's timer-start button:

```tsx
                <div className="flex items-center gap-3">
                  {step.timerMinutes && !existingTimer && (
                    <button type="button"
                      onClick={() => onStartTimer(step.instruction.slice(0, 40), step.timerMinutes!, step.groupIdx, step.stepIdx)}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-amber/10 border border-amber/30 text-amber hover:bg-amber/20 transition-colors"
                    >
                      ⏱ {lang === 'he' ? `התחל טיימר ${step.timerMinutes} דק'` : `Start ${step.timerMinutes}m timer`}
                    </button>
                  )}
```

This only covers starting a NEW timer for the current step. Add a bigger labeled ring for a timer that's already running/paused, right before this `<div className="flex items-center gap-3">` block:

```tsx
                {displayedTimer && (
                  <div className="flex flex-col items-center gap-2">
                    <button type="button"
                      onClick={() => onToggleNearestTimer()}
                      aria-label={displayedTimer.running ? tx.pauseTimer : tx.resumeTimer}
                    >
                      <TimerRing fraction={displayedTimer.totalSeconds > 0 ? displayedTimer.remainingSeconds / displayedTimer.totalSeconds : 0} size={88}>
                        {formatDockDuration(displayedTimer.remainingSeconds)}
                      </TimerRing>
                    </button>
                    <p className="text-xs text-cream/40 max-w-xs text-center">{tx.timerFor(displayedTimer.label)}</p>
                  </div>
                )}
                <div className="flex items-center gap-3">
```

`TimerRing` currently hardcodes `size = 56` internally. Update its signature to accept an optional size:

Find:

```typescript
function TimerRing({ fraction, children }: { fraction: number; children: React.ReactNode }) {
  const size = 56
```

Replace with:

```typescript
function TimerRing({ fraction, children, size = 56 }: { fraction: number; children: React.ReactNode; size?: number }) {
```

- [ ] **Step 8: Add a Pause/Continue control inside the dock (collapsed and expanded)**

In the collapsed bar, find the timer-ring block from Step 6 and add a pause/continue icon button right before it (inside the same `<div className="flex-1 flex items-center justify-between px-4 gap-3">` row, so it sits between the label and the timer ring):

```tsx
            <button type="button"
              onClick={e => { e.stopPropagation(); cookingPaused ? onResumeCooking() : onPauseCooking() }}
              aria-label={cookingPaused ? tx.continueCooking : tx.pauseCooking}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-cream/40 hover:text-cream/70 transition-colors"
            >
              {cookingPaused ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20" /></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              )}
            </button>
```

In the expanded header, find:

```tsx
          <div className="flex items-center justify-between px-4 h-14 border-b border-tint/[0.06] shrink-0">
            <span className="text-cream/40 text-sm">{collapsedStepLabel}</span>
            <button type="button"
              onClick={e => { e.stopPropagation(); onStop() }}
              className="px-3 h-8 flex items-center justify-center rounded-full text-xs font-medium border border-tint/[0.12] text-cream/55 bg-transparent hover:border-amber/40 hover:text-amber transition-colors"
            >
              {tx.stopCooking}
            </button>
          </div>
```

Replace with (adds a Pause/Continue button next to Stop; the header row's label truncates the step text since it's now potentially long):

```tsx
          <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-tint/[0.06] shrink-0">
            <span className="text-cream/40 text-sm truncate min-w-0">{collapsedStepLabel}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button"
                onClick={e => { e.stopPropagation(); cookingPaused ? onResumeCooking() : onPauseCooking() }}
                className="px-3 h-8 flex items-center justify-center rounded-full text-xs font-medium border border-tint/[0.12] text-cream/55 bg-transparent hover:border-amber/40 hover:text-amber transition-colors"
              >
                {cookingPaused ? tx.continueCooking : tx.pauseCooking}
              </button>
              <button type="button"
                onClick={e => { e.stopPropagation(); onStop() }}
                className="px-3 h-8 flex items-center justify-center rounded-full text-xs font-medium border border-tint/[0.12] text-cream/55 bg-transparent hover:border-amber/40 hover:text-amber transition-colors"
              >
                {tx.stopCooking}
              </button>
            </div>
          </div>
```

- [ ] **Step 9: Thread the new props through `App.tsx`'s `<CookDock>` call**

In `src/App.tsx`, find the `<CookDock ... />` call (already modified by Task 2) and add these five props anywhere in the list:

```tsx
          cookingPaused={cookSession.cookingPaused}
          pausedAt={cookSession.pausedAt}
          totalPausedMs={cookSession.totalPausedMs}
          onPauseCooking={cookSession.pauseCooking}
          onResumeCooking={cookSession.resumeCooking}
```

- [ ] **Step 10: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with zero TypeScript errors.

Run: `npx eslint src/components/CookDock.tsx src/App.tsx src/i18n.ts`
Expected: zero errors/warnings.

- [ ] **Step 11: Manual verification**

1. Collapsed bar and expanded header show the actual step instruction text, not "Step X of Y".
2. Start a timer on a step, collapse the dock: ring shows in the collapsed bar as before. Expand the dock while on that step: the same timer shows again, bigger, with a "Timer: <step text>" label underneath.
3. On the recipe's normal (non-cooking) page, manually check a few steps' checkboxes, then click "Start cooking" - the dock opens directly on the steps screen at the first unchecked step, not the ingredients checklist.
4. Pause via the dock's own control (both collapsed and expanded) - elapsed time freezes; any interaction (Next/Prev/start a timer) resumes it automatically; the explicit Continue button also resumes it.

- [ ] **Step 12: Commit**

```bash
git add src/components/CookDock.tsx src/App.tsx src/i18n.ts
git commit -m "feat: bigger labeled timer, real step text, mid-recipe resume, in-dock pause control"
```

---

### Task 5: `TimerPanel` excludes the actively-cooked recipe's timers

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `cookSession.activeRecipeId` (already existing).

- [ ] **Step 1: Filter `TimerPanel`'s timers**

In `src/App.tsx`, find the `<TimerPanel>` render call:

```tsx
      <AnimatePresence>
        {timers.length > 0 && (
          <TimerPanel
            panelRef={timerPanelRef}
            timers={timers}
            onToggle={toggleTimer}
            onRemove={removeTimer}
            onReset={resetTimer}
          />
        )}
      </AnimatePresence>
```

Replace with (excludes whatever recipe is currently being cooked - `CookDock` already owns that timer's display entirely, per Task 4; when no session is active, `cookSession.activeRecipeId` is `undefined` and every real timer's `recipeId` is a non-empty string, so the filter is a no-op and behavior is unchanged from today in that case):

```tsx
      <AnimatePresence>
        {(() => {
          const otherTimers = timers.filter(t => t.recipeId !== cookSession.activeRecipeId)
          return otherTimers.length > 0 && (
            <TimerPanel
              panelRef={timerPanelRef}
              timers={otherTimers}
              onToggle={toggleTimer}
              onRemove={removeTimer}
              onReset={resetTimer}
            />
          )
        })()}
      </AnimatePresence>
```

Find the `timerBarHeight` measurement effect (it currently keys off `timers.length`, which must also switch to the filtered list so the measured height/ResizeObserver correctly reflects zero when the only timers left are the cooked recipe's own):

```typescript
  useEffect(() => {
    const el = timerPanelRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setTimerBarHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      setTimerBarHeight(0)
    }
  }, [timers.length])
```

Leave this effect's body as-is (it observes the actual rendered element regardless of which array produced it) but change its dependency array from `[timers.length]` to `[timers.length, cookSession.activeRecipeId]`, since the panel can now mount/unmount purely from `activeRecipeId` changing even when `timers.length` itself doesn't:

```typescript
  }, [timers.length, cookSession.activeRecipeId])
```

- [ ] **Step 2: Build and lint**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: succeeds with zero TypeScript errors.

Run: `npx eslint src/App.tsx`
Expected: zero errors/warnings.

- [ ] **Step 3: Manual verification**

1. Start a timer on some step of recipe A's normal (non-cooking) page, without starting a cook session - `TimerPanel` shows it at the bottom as before.
2. Start cooking recipe A - that same timer (if still running) now shows only inside the dock, not in `TimerPanel` (no duplicate).
3. While cooking recipe A, start a timer from browsing recipe B's normal page (a different, non-cooked recipe) - `TimerPanel` shows B's timer, positioned above the collapsed dock (per Task 2's reserved-space fix).
4. Stop cooking recipe A - if A's timer is still running, it now reappears in `TimerPanel` again (no longer filtered out, since `activeRecipeId` is `undefined`).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: TimerPanel excludes the actively-cooked recipe's timers"
```

---

## Final Verification (item F - no code, confirm existing behavior)

After Task 5, do one more manual check that requires no code: start cooking a recipe, then refresh the page (or open the same recipe on a second device/browser profile while signed in as the same user). Confirm the dock reappears **collapsed**, not expanded. This should already work without any change in this plan - `startDockExpanded` (which controls the dock's initial expand state) is only ever set by a fresh "Start cooking" click, never by the cross-device/page-refresh resume path (`discoverActiveSession`). If this check fails, it's a regression from one of the five tasks above (most likely Task 2's CSS changes or Task 4's initial-screen change in Step 5) - investigate against `useCookSession.ts`'s `discoverActiveSession` and `startDockExpanded` before assuming new code is needed.
