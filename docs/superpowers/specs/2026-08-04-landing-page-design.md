# Signed-Out Landing Page Design

## Goal

Replace the bare Clerk `<SignIn>` card shown to signed-out users with a
proper landing page that explains what the app is, without exposing any
actual recipe content/data to unauthenticated visitors.

## Audience & tone

Semi-open: framed as a personal cookbook a handful of people (family/
friends) get invited into. Warm, personal copy - not generic SaaS
marketing-speak.

## Layout

Two-column on desktop (`sm` and up), stacked on mobile:

- **Left column:** hero headline + subhead, then a 2x2 feature grid.
- **Right column:** the existing Clerk `<SignIn>` component, unchanged -
  just given context around it instead of sitting alone on a blank page.
- **Mobile:** hero + pitch first, `<SignIn>` next, feature grid last.

No recipe data is fetched or rendered on this page. This only replaces
the `!isSignedIn` branch in `App.tsx` - no new routes, no new API calls.

## Copy

Feature grid (4 cards, each an icon/emoji + short label + one-line
description):

1. **AI-assisted writing, human-made recipes** - every recipe is written
   by a person; AI just helps with the busywork (import from a link,
   photo, or PDF and clean up the details). Co-pilot, not the pilot.
2. **Bilingual by default** - every recipe lives in Hebrew and English,
   with auto-translate throughout.
3. **Meal planning + shopping list** - plan meals across the week and get
   one combined shopping list.
4. **Checked before it's added** - every recipe is reviewed before it's
   published, so nothing half-tested makes it in. (True today via manual
   review; phrased without naming a specific mechanism so it doesn't
   overclaim tooling that doesn't exist yet.)

Feature requests get a lighter mention in the subhead/footer area only
("have an idea? request it"), not a full grid card, per the "frame
honestly" decision.

## Component

New `src/components/LandingPage.tsx`, rendered in place of the current

```tsx
if (!isSignedIn) {
  return (
    <div className="min-h-dvh bg-bg flex items-center justify-center px-6">
      <SignIn />
    </div>
  )
}
```

block in `App.tsx`. Pure presentational component (headline/subhead
strings, a static feature-grid array, and `<SignIn />` in the right
column) - no props, no data fetching, styled with the existing Tailwind
tokens (`bg-bg`, `text-cream`, `text-amber`, `card` class, etc.) already
used everywhere else in the app. Bilingual copy follows the existing
`lang === 'he' ? '...' : '...'` inline-ternary convention (matches
`RecipeImportPage.tsx`, `Sidebar.tsx`) rather than the `i18n.ts` `t[lang]`
dictionary, since this is the only place these strings are used.

## Out of scope

- No new backend/API work.
- No screenshot/preview imagery of real recipes (constraint: never show
  recipe content to unauthenticated visitors). Feature grid uses generic
  icons/emoji only.
- No changes to Clerk configuration, sign-up policy, or the `<SignIn>`
  component itself.
