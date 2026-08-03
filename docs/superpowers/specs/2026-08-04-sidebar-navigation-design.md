# Sidebar Navigation Design

## Goal

Replace the current top-bar + Clerk-`UserButton`-dropdown navigation with a
persistent sidebar (Notion-style), plus breadcrumbs on recipe detail and
recipe form pages, so navigation is organized in one place instead of
scattered across icon buttons and a dropdown menu.

Frontend-only change. No backend/API changes.

## Current state

`src/components/Nav.tsx` is a slim top bar with icon buttons (New Recipe,
My Recipes, an "attention" badge icon for pending submissions/rejected
recipes, Shopping list) plus a Clerk `UserButton` dropdown holding
Collections, Meal Plan, Feature Requests, a language toggle, a theme
toggle, and (admin-only) Review Queue.

No existing UI component library is installed (no shadcn/ui, no Radix, no
Headless UI) - all UI in this codebase, including the existing
`ShoppingListPanel` slide-over, is hand-rolled with plain Tailwind classes
and React state. The sidebar and its mobile drawer follow the same
pattern; no new dependency is introduced for this feature.

## Layout

**Desktop (`sm` breakpoint and up):** sidebar pinned to the left edge,
240px wide when expanded, 64px (icon-only) when collapsed. A toggle arrow
at the bottom of the sidebar switches between the two; the collapsed/
expanded state persists to `localStorage` (key `sidebar-collapsed`) so it
survives reloads. Content area and top bar shift right to fill the
remaining width.

**Mobile (below `sm`):** the sidebar is hidden by default and slides in
as an off-canvas drawer over a dark backdrop, opened via a hamburger icon
in the top bar. It closes on backdrop click or immediately after
navigating to a new route. This state is transient (component state, not
persisted).

**Top bar** (rebuilt, replaces most of current `Nav.tsx`): app
name/logo, hamburger icon (mobile only, opens the drawer), shopping-list
icon (unchanged behavior - opens the existing slide-over panel), and the
Clerk `UserButton` (now holds only Clerk's own account actions - profile,
sign out - no custom menu items).

## Sidebar contents (top to bottom)

1. App name/logo (links to `/`)
2. A prominent "+ New Recipe" button (navigates to `/recipes/new`)
3. Group **Recipes**: Home, My Recipes, Collections, Meal Plan
4. Group **More**: Feature Requests, and only for the admin user (`userId
   === OWNER_USER_ID`), Review Queue
5. The existing attention badge (pending submissions count for the admin,
   or rejected-recipe count for everyone else) moves from its own top-bar
   icon onto the relevant sidebar link: Review Queue for the admin, My
   Recipes for everyone else.
6. Collapse/expand toggle (desktop only - the mobile drawer has no
   collapsed state, it's either open or closed)
7. A bottom settings row: language toggle and theme toggle (moved out of
   the `UserButton` dropdown)

## Components

- **`src/hooks/useSidebar.ts`**: `{ collapsed, setCollapsed, mobileOpen,
  setMobileOpen }`. `collapsed` initializes from `localStorage` and
  writes back on change. `mobileOpen` is plain component state (no
  persistence).
- **`src/components/Sidebar.tsx`**: renders the structure above. Owns the
  `isAdmin` / `attentionCount` logic that currently lives in `Nav.tsx`
  (via `useAuth`, `OWNER_USER_ID`, `useMyRecipes`, `usePendingSubmissions`
  - moved here since nothing else needs it once the top bar no longer
  shows that icon). Closes the mobile drawer on any internal link click
  (via `useNavigate` + calling `setMobileOpen(false)`).
- **`src/components/Nav.tsx`** (rewritten): slim top bar as described
  above. Renders `<Sidebar />` as a sibling so the drawer/backdrop can
  overlay the whole page; passes the hamburger click through to
  `Sidebar`'s `setMobileOpen`.
- **`src/components/Breadcrumbs.tsx`**: presentational component. Props:
  `crumbs: { label: string; href?: string }[]`. Renders a `/`-separated
  chain; every crumb except the last is a link (if `href` given),  the
  last is plain text (current page, not clickable). Rendered just under
  the top bar's height (`pt-14` equivalent) on:
  - `RecipeDetail.tsx`: `Home / {category} / {recipe title}` - the
    category crumb links to `/?category={category}` if that filtering
    already exists on Home, otherwise it's plain text (checked during
    implementation).
  - `RecipeForm.tsx`: `Home / {existing recipe title, or "New Recipe"} /
    {"Edit" or "New"}`.

## Testing

- `Sidebar.spec.tsx`: renders both link groups; admin sees Review Queue,
  non-admin doesn't; attention badge shows on the correct link for each
  role; collapse toggle flips state and persists to `localStorage`;
  mobile drawer opens/closes via `mobileOpen` and closes after a link
  click.
- `Breadcrumbs.spec.tsx`: renders the full crumb chain; only non-last
  crumbs with an `href` render as links; last crumb is plain text.
- Manual browser check: resize across the `sm` breakpoint to confirm the
  pinned-sidebar vs. off-canvas-drawer switch, and confirm the
  collapsed/expanded toggle persists across a reload.

## Out of scope

- No global search (Home already has its own search box with a `/`
  keyboard shortcut; unrelated to this change).
- No changes to `ShoppingListPanel`'s behavior, only where its trigger
  icon lives (stays in the top bar).
- No backend/API changes.
