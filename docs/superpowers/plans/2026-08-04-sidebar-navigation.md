# Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current top-bar-icons + Clerk-`UserButton`-dropdown navigation with a persistent Notion-style sidebar (pinned + collapsible on desktop, off-canvas drawer on mobile), and add breadcrumbs to the recipe detail and recipe form pages.

**Architecture:** Two new components (`Sidebar`, `Breadcrumbs`) and one new hook (`useSidebar`). `Nav.tsx` is rewritten down to a slim top bar (hamburger + shopping-list icon + `UserButton`). `App.tsx` instantiates `useSidebar` once and renders `<Sidebar>` as a sibling of `<Nav>`, wrapping `<Routes>` in a div whose start-padding shifts content clear of the pinned desktop sidebar.

**Tech Stack:** React 19, Tailwind CSS (logical properties `start-0`/`ps-*` - the app already sets `dir` on `<html>` via `LanguageContext`, so these flip automatically for Hebrew/English), `framer-motion` (already a dependency, used identically in `ShoppingListPanel.tsx` for its slide-over), `react-router-dom`.

## Global Constraints

- No new npm dependency. No UI library (no shadcn/ui, no Radix) - this codebase has none and all existing overlays (`ShoppingListPanel`, `TimerPanel`) are hand-rolled Tailwind + framer-motion.
- **No frontend test framework exists in this repo** (verified: no vitest/jest config, no `.test.`/`.spec.` files under `src/`). Every existing frontend feature this session was verified via `npx tsc -b` + `npx eslint <files>` + manual/browser check - not automated tests. Follow that same pattern here; do not introduce a test framework as part of this plan.
- Follow the existing icon/emoji reuse rule from the design spec: reuse the *exact* icons/emoji already used for a destination elsewhere in the app (New Recipe, My Recipes, and the attention bell path all come from the current `Nav.tsx`; Collections 📚, Meal Plan 🗓️, Feature Requests 💡, Review Queue ✅ all come from the current `UserButton.MenuItems` in `Nav.tsx`).
- Every task ends with: `npx tsc -b` clean, `npx eslint <touched files>` clean, and a one-line manual verification note (run `npm run dev`, check in browser).

---

### Task 1: `useSidebar` hook + `Sidebar` component

**Files:**
- Create: `src/hooks/useSidebar.ts`
- Create: `src/components/Sidebar.tsx`

**Interfaces:**
- Produces: `useSidebar(): { collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen: boolean; setMobileOpen: (v: boolean | ((v: boolean) => boolean)) => void }`
- Produces: `Sidebar({ sidebar }: { sidebar: ReturnType<typeof useSidebar> })` - a default-exported component with no other props. It reads `useAuth`, `OWNER_USER_ID` (from `../lib/admin`), `useMyRecipes`/`usePendingSubmissions` (from `../hooks/useRecipes`), `useLanguage`, `useTheme`, and `useFocusTrap` (from `../hooks/useFocusTrap`) itself - it is self-contained aside from the `sidebar` prop.
- Consumes (Task 2 depends on these): both of the above.

- [ ] **Step 1: Write `useSidebar.ts`**

```ts
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'sidebar-collapsed'

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  return { collapsed, setCollapsed, mobileOpen, setMobileOpen }
}
```

- [ ] **Step 2: Write `Sidebar.tsx`**

```tsx
import { type ReactNode, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '../hooks/useLanguage'
import { useTheme } from '../hooks/useTheme'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useMyRecipes, usePendingSubmissions } from '../hooks/useRecipes'
import { OWNER_USER_ID } from '../lib/admin'
import type { useSidebar } from '../hooks/useSidebar'

interface SidebarProps {
  sidebar: ReturnType<typeof useSidebar>
}

interface SidebarLinkDef {
  key: string
  label: string
  path: string
  icon: ReactNode
  badge?: number
}

export default function Sidebar({ sidebar }: SidebarProps) {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = sidebar
  const navigate = useNavigate()
  const location = useLocation()
  const { lang, setLang } = useLanguage()
  const { mode, cycleTheme } = useTheme()
  const { userId } = useAuth()
  const isAdmin = userId === OWNER_USER_ID
  const { recipes: pendingSubmissions } = usePendingSubmissions(isAdmin)
  const { recipes: myRecipes } = useMyRecipes(!isAdmin)
  const attentionCount = isAdmin
    ? pendingSubmissions.length
    : myRecipes.filter(r => r.status === 'rejected').length
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, mobileOpen)

  const recipeLinks: SidebarLinkDef[] = [
    {
      key: 'home', label: lang === 'he' ? 'בית' : 'Home', path: '/',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7m-14 0v8a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1v-8m-16 0l2-2" />
        </svg>
      ),
    },
    {
      key: 'my-recipes', label: lang === 'he' ? 'המתכונים שלי' : 'My Recipes', path: '/my-recipes',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      badge: !isAdmin && attentionCount > 0 ? attentionCount : undefined,
    },
    { key: 'collections', label: lang === 'he' ? 'האוספים שלי' : 'My Collections', path: '/collections', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">📚</span> },
    { key: 'meal-plan', label: lang === 'he' ? 'תוכנית ארוחות' : 'Meal Plan', path: '/meal-plan', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">🗓️</span> },
  ]

  const moreLinks: SidebarLinkDef[] = [
    { key: 'feature-requests', label: lang === 'he' ? 'בקשות לתכונות חדשות' : 'Feature Requests', path: '/feature-requests', icon: <span className="w-4 h-4 flex items-center justify-center text-sm">💡</span> },
    ...(isAdmin ? [{
      key: 'admin-submissions',
      label: lang === 'he' ? 'תור אישורים' : 'Review Queue',
      path: '/admin/submissions',
      icon: <span className="w-4 h-4 flex items-center justify-center text-sm">✅</span>,
      badge: attentionCount > 0 ? attentionCount : undefined,
    }] : []),
  ]

  function renderLink(link: SidebarLinkDef, showLabel: boolean, onNavigate?: () => void) {
    const active = location.pathname === link.path
    return (
      <button
        key={link.key}
        type="button"
        onClick={() => { navigate(link.path); onNavigate?.() }}
        title={link.label}
        className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors w-full ${
          active ? 'bg-amber/10 text-amber' : 'text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05]'
        }`}
      >
        <span className="shrink-0">{link.icon}</span>
        {showLabel && <span className="truncate">{link.label}</span>}
        {link.badge !== undefined && (
          <span className={`shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center ${showLabel ? 'ms-auto' : 'absolute top-0 end-0'}`}>
            {link.badge}
          </span>
        )}
      </button>
    )
  }

  function content(showLabel: boolean, onNavigate?: () => void) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-3">
          <button
            type="button"
            onClick={() => { navigate('/recipes/new'); onNavigate?.() }}
            title={lang === 'he' ? 'מתכון חדש' : 'New Recipe'}
            className={`flex items-center gap-2 w-full rounded-lg border border-tint/10 hover:bg-tint/[0.05] text-cream/80 px-3 py-2 text-sm font-medium transition-colors ${showLabel ? '' : 'justify-center'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {showLabel && (lang === 'he' ? 'מתכון חדש' : 'New Recipe')}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-4">
          <div className="space-y-1">
            {showLabel && <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-cream/30 mb-1">{lang === 'he' ? 'מתכונים' : 'Recipes'}</div>}
            {recipeLinks.map(link => renderLink(link, showLabel, onNavigate))}
          </div>
          <div className="space-y-1">
            {showLabel && <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-cream/30 mb-1">{lang === 'he' ? 'עוד' : 'More'}</div>}
            {moreLinks.map(link => renderLink(link, showLabel, onNavigate))}
          </div>
        </nav>

        <div className="p-3 border-t border-tint/[0.06] space-y-1">
          <button
            type="button"
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            title={lang === 'he' ? 'English' : 'עברית'}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05] transition-colors ${showLabel ? '' : 'justify-center'}`}
          >
            <span className="w-4 h-4 flex items-center justify-center text-sm shrink-0">🌐</span>
            {showLabel && (lang === 'he' ? 'English' : 'עברית')}
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            title={mode === 'light' ? 'Switch to dark mode' : mode === 'dark' ? 'Switch to system theme' : 'Switch to light mode'}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05] transition-colors ${showLabel ? '' : 'justify-center'}`}
          >
            <span className="w-4 h-4 flex items-center justify-center text-sm shrink-0">{mode === 'light' ? '🌙' : mode === 'dark' ? '🖥️' : '☀️'}</span>
            {showLabel && (mode === 'light' ? (lang === 'he' ? 'מצב כהה' : 'Dark mode') : mode === 'dark' ? (lang === 'he' ? 'לפי המערכת' : 'System theme') : (lang === 'he' ? 'מצב בהיר' : 'Light mode'))}
          </button>
          {showLabel && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="hidden sm:flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={lang === 'he' ? 'M8.25 4.5l7.5 7.5-7.5 7.5' : 'M15.75 4.5l-7.5 7.5 7.5 7.5'} />
              </svg>
              {lang === 'he' ? 'כווץ' : 'Collapse'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop pinned sidebar */}
      <aside className={`print:hidden hidden sm:flex sm:flex-col fixed top-14 bottom-0 start-0 z-30 border-e border-tint/[0.06] bg-bg transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
        {collapsed ? (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden">{content(false)}</div>
            <div className="p-3 border-t border-tint/[0.06]">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="flex items-center justify-center w-full rounded-lg px-3 py-2 text-cream/40 hover:text-cream/70 hover:bg-tint/[0.05] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={lang === 'he' ? 'M15.75 4.5l-7.5 7.5 7.5 7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
                </svg>
              </button>
            </div>
          </div>
        ) : content(true)}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="print:hidden sm:hidden fixed inset-0 bg-black/40 z-40"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              initial={{ x: lang === 'he' ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: lang === 'he' ? '100%' : '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="print:hidden sm:hidden fixed top-0 bottom-0 start-0 w-72 bg-bg z-50 shadow-2xl"
            >
              {content(true, () => setMobileOpen(false))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
```

Note: `UserButton` is imported but unused in this file - remove that import. (Left as a reminder: double-check no unused imports before commit; `useAuth` is used, `UserButton` is not needed here since it stays in `Nav.tsx`.)

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc -b` - expect no errors (fix the unused `UserButton` import from Step 2 if `tsc`/`eslint` flags it).
Run: `npx eslint src/hooks/useSidebar.ts src/components/Sidebar.tsx` - expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSidebar.ts src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component and useSidebar hook"
```

---

### Task 2: Rewrite `Nav.tsx` and wire `Sidebar` into `App.tsx`

**Files:**
- Modify: `src/components/Nav.tsx` (full rewrite)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useSidebar` from Task 1 (`src/hooks/useSidebar.ts`), `Sidebar` from Task 1 (`src/components/Sidebar.tsx`).
- Produces: `Nav` now takes `{ shoppingListCount: number; onOpenShoppingList: () => void; onToggleMobileSidebar: () => void }` (dropped nothing from the public prop list except it no longer needs anything else - `onToggleMobileSidebar` is new).

- [ ] **Step 1: Rewrite `Nav.tsx`**

Replace the entire file with:

```tsx
import { useNavigate } from 'react-router-dom'
import { UserButton } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'

interface NavProps {
  shoppingListCount: number
  onOpenShoppingList: () => void
  onToggleMobileSidebar: () => void
}

export default function Nav({ shoppingListCount, onOpenShoppingList, onToggleMobileSidebar }: NavProps) {
  const navigate = useNavigate()
  const { lang } = useLanguage()

  return (
    <nav className="print:hidden fixed top-0 inset-x-0 z-50 bg-bg/90 backdrop-blur-md border-b border-tint/[0.06]">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2" dir="ltr">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button"
            onClick={onToggleMobileSidebar}
            aria-label={lang === 'he' ? 'תפריט' : 'Menu'}
            className="sm:hidden h-10 w-10 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream/90 hover:bg-tint/[0.05] transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
          <button type="button"
            onClick={() => navigate('/')}
            aria-label={lang === 'he' ? 'לדף הבית' : 'Go to home'}
            className="font-serif text-base sm:text-lg font-medium text-cream/90 hover:text-cream tracking-wide transition-colors truncate min-w-0"
          >
            Tugy's Cookbook
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          <button type="button"
            onClick={onOpenShoppingList}
            className="relative h-10 w-10 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream/70 border border-tint/10 hover:bg-tint/[0.05] transition-colors"
            title={lang === 'he' ? 'רשימת קניות' : 'Shopping list'}
            aria-label={lang === 'he' ? 'רשימת קניות' : 'Shopping list'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m-10 0a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {shoppingListCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-bg text-[9px] font-bold flex items-center justify-center">
                {shoppingListCount}
              </span>
            )}
          </button>

          <UserButton />
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Wire `useSidebar` + `Sidebar` into `App.tsx`**

In `src/App.tsx`, add imports:

```tsx
import { useSidebar } from './hooks/useSidebar'
import Sidebar from './components/Sidebar'
```

Inside the `App` component, add (alongside the existing `useTimers`/`useShoppingList` calls):

```tsx
const sidebar = useSidebar()
```

Change the `<Nav .../>` call to pass the new prop:

```tsx
<Nav
  shoppingListCount={shoppingList.items.length}
  onOpenShoppingList={() => setShoppingListOpen(true)}
  onToggleMobileSidebar={() => sidebar.setMobileOpen(o => !o)}
/>
<Sidebar sidebar={sidebar} />
```

Wrap the existing `<Routes>...</Routes>` block in a padding div so page content clears the pinned desktop sidebar (padding only applies at the `sm:` breakpoint and up, matching the sidebar itself being `hidden sm:flex`):

```tsx
<div className={`transition-[padding] duration-200 ${sidebar.collapsed ? 'sm:ps-16' : 'sm:ps-60'}`}>
  <Routes>
    {/* ...unchanged... */}
  </Routes>
</div>
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc -b` - expect no errors.
Run: `npx eslint src/components/Nav.tsx src/App.tsx` - expect no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open the app:
- Desktop width: sidebar is pinned on the left (English) / right (Hebrew), top bar has no hamburger.
- Resize below the `sm` breakpoint (~640px): sidebar disappears, hamburger appears in the top bar; clicking it opens the drawer over a dark backdrop; clicking a link inside it navigates and closes the drawer.
- Click the sidebar's collapse arrow: sidebar shrinks to icon-only, page content padding shrinks to match; expand arrow (now inside the icon rail) restores it. Reload the page - the collapsed/expanded state should persist.
- Confirm the attention badge appears on "Review Queue" for the admin account, or on "My Recipes" for a non-admin account with a rejected recipe.

- [ ] **Step 5: Commit**

```bash
git add src/components/Nav.tsx src/App.tsx
git commit -m "feat: rewrite Nav to slim top bar, wire in persistent Sidebar"
```

---

### Task 3: `Breadcrumbs` component

**Files:**
- Create: `src/components/Breadcrumbs.tsx`

**Interfaces:**
- Produces: `interface Crumb { label: string; href?: string }` and `Breadcrumbs({ crumbs: Crumb[] })` default export. The last entry in `crumbs` is always rendered as plain (non-clickable) text regardless of whether it has an `href`; every earlier entry with an `href` renders as a clickable button that navigates there.

- [ ] **Step 1: Write `Breadcrumbs.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'

export interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  crumbs: Crumb[]
}

export default function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  const navigate = useNavigate()
  return (
    <nav className="print:hidden flex items-center gap-1.5 text-xs text-cream/40 mb-4 flex-wrap">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-cream/20">/</span>}
            {!isLast && crumb.href ? (
              <button type="button" onClick={() => navigate(crumb.href!)} className="hover:text-cream/70 transition-colors">
                {crumb.label}
              </button>
            ) : (
              <span className={isLast ? 'text-cream/60' : ''}>{crumb.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc -b` - expect no errors.
Run: `npx eslint src/components/Breadcrumbs.tsx` - expect no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Breadcrumbs.tsx
git commit -m "feat: add Breadcrumbs component"
```

---

### Task 4: Breadcrumbs on `RecipeDetail.tsx`

**Files:**
- Modify: `src/components/RecipeDetail.tsx`

**Interfaces:**
- Consumes: `Breadcrumbs` and `Crumb` from Task 3 (`src/components/Breadcrumbs.tsx`).

`RecipeDetail.tsx` already computes (do not redefine, these exist at line ~405-406):
```ts
const displayTitle = lang === 'he' ? (displayRecipe.titleHe ?? displayRecipe.title) : displayRecipe.title
```
and `tx = t[lang]` (line 39), with `tx.categories[displayRecipe.category]` already used elsewhere in this same file (line ~532) for the category tag.

- [ ] **Step 1: Add the import**

Near the top of `RecipeDetail.tsx`, alongside the other component imports, add:

```tsx
import Breadcrumbs from './Breadcrumbs'
```

- [ ] **Step 2: Render breadcrumbs above the header card**

Find this existing structure (around line 526-528):

```tsx
      <div className="max-w-3xl mx-auto px-4 -mt-16 print:mt-4 relative pb-24">
        {/* Header card */}
        <div className="card p-6 mb-6">
```

Change it to:

```tsx
      <div className="max-w-3xl mx-auto px-4 -mt-16 print:mt-4 relative pb-24">
        <Breadcrumbs crumbs={[
          { label: lang === 'he' ? 'בית' : 'Home', href: '/' },
          { label: tx.categories[displayRecipe.category] },
          { label: displayTitle },
        ]} />
        {/* Header card */}
        <div className="card p-6 mb-6">
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc -b` - expect no errors.
Run: `npx eslint src/components/RecipeDetail.tsx` - expect no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open any recipe detail page. Confirm the breadcrumb row `Home / {category} / {title}` appears above the header card, "Home" is clickable and navigates to `/`, the category and title segments are plain text.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeDetail.tsx
git commit -m "feat: add breadcrumbs to recipe detail page"
```

---

### Task 5: Breadcrumbs on `RecipeForm.tsx`

**Files:**
- Modify: `src/components/RecipeForm.tsx`

**Interfaces:**
- Consumes: `Breadcrumbs` and `Crumb` from Task 3 (`src/components/Breadcrumbs.tsx`).

`RecipeForm.tsx` already has (do not redefine): `isEditing` (`const isEditing = !!existing`, line 91), `title`/`titleHe` state, `existing?.id`, and `tx = t[lang]` (line 90).

- [ ] **Step 1: Add the import**

Near the top of `RecipeForm.tsx`, alongside the other component imports:

```tsx
import Breadcrumbs from './Breadcrumbs'
```

- [ ] **Step 2: Render breadcrumbs above the page heading**

Find this existing structure (around line 345-354):

```tsx
  return (
    <div className="min-h-dvh bg-bg pt-20 px-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        <h1 className="font-serif text-2xl font-bold text-cream">
```

Change it to:

```tsx
  const displayTitle = (lang === 'he' ? titleHe : title) || title || titleHe

  return (
    <div className="min-h-dvh bg-bg pt-20 px-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        <Breadcrumbs crumbs={
          isEditing
            ? [
                { label: lang === 'he' ? 'בית' : 'Home', href: '/' },
                { label: displayTitle || (lang === 'he' ? 'מתכון' : 'Recipe'), href: `/recipe/${existing!.id}` },
                { label: lang === 'he' ? 'עריכה' : 'Edit' },
              ]
            : [
                { label: lang === 'he' ? 'בית' : 'Home', href: '/' },
                { label: lang === 'he' ? 'מתכון חדש' : 'New Recipe' },
              ]
        } />
        <h1 className="font-serif text-2xl font-bold text-cream">
```

(Editing shows a 3-segment trail ending in "Edit"; creating/duplicating/importing shows a 2-segment trail ending in "New Recipe" - a redundant third "New" segment was deliberately dropped as it added no information.)

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc -b` - expect no errors.
Run: `npx eslint src/components/RecipeForm.tsx` - expect no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Open an existing recipe's edit page - confirm `Home / {title} / Edit`, with "Home" and the title both clickable. Open "New Recipe" (blank) - confirm `Home / New Recipe` with only "Home" clickable.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeForm.tsx
git commit -m "feat: add breadcrumbs to recipe form page"
```

---

## Self-Review Notes

- **Spec coverage:** Desktop pinned/collapsible sidebar (Task 1, 2), mobile off-canvas drawer (Task 1, 2), two link groups + New Recipe button + attention badges (Task 1), settings row for language/theme (Task 1), slim top bar (Task 2), breadcrumbs on recipe detail and recipe form (Task 3, 4, 5). All spec sections are covered.
- **Testing deviation from spec:** the spec's Testing section proposed `Sidebar.spec.tsx`/`Breadcrumbs.spec.tsx` component tests. This repo has no frontend test framework at all (confirmed via search), and every other frontend feature this session shipped with `tsc`/`eslint`/manual verification only. Adding a test framework is a separate, larger decision than this feature warrants - each task's verification step instead follows the codebase's existing convention.
- **Deviation from spec's breadcrumb notation:** the spec described `RecipeForm`'s trail as always 3 segments (`Home / {title-or-"New Recipe"} / {Edit|New}`). Task 5 uses 2 segments for the non-editing case (`Home / New Recipe`) since a trailing "New Recipe / New" is redundant - noted inline in Task 5.
