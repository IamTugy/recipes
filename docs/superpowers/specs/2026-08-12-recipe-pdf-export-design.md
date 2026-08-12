# Recipe PDF Export — Design

## Goal

Replace the single-recipe print button's current browser-print output (`window.print()` + `@media print` CSS on the live `RecipeDetail` page) with a real, downloadable, branded PDF that reads like a food-magazine/cookbook page — matching the compositional patterns in the reference images (icon meta row, hero photo, checklist ingredients, numbered method, branded footer) but rendered in the app's own typography and color palette rather than a generic template.

## Background

There is currently no PDF-generation library anywhere in this codebase (confirmed via `package.json`). "Printing" a recipe today means the browser's native print dialog rendering the live `RecipeDetail` DOM with `print:*` Tailwind overrides and a dedicated `@media print` block in `src/index.css` (A4 page size/margins, serif print typography, break-avoid rules). That CSS-print investment is real but has a hard ceiling: it cannot produce the graphic-design composition in the reference images (precise icon rows, photo placement, decorative dividers, drop-shadow cards) — those require pixel-level layout control browser print doesn't give.

`CollectionPrintPage.tsx` (the multi-recipe booklet export) uses the same browser-print approach and is explicitly **out of scope** for this spec — it keeps working exactly as it does today. This is a single-recipe-only redesign; the booklet gets its own follow-up spec once this ships and the template/pattern is proven.

## Approach

`@react-pdf/renderer` — a from-scratch React tree built from its own layout primitives (`Document`, `Page`, `View`, `Text`, `Image`, `Svg`), not regular HTML/CSS. This is the only approach of the three considered (the others were "push the existing browser-print CSS further" and "html2canvas + jsPDF rasterization") that gives real control over composition (exact icon placement, multi-column layout, vector/selectable text) and produces an actual "Download PDF" file instead of depending on the OS print dialog.

New dependencies: `@react-pdf/renderer` (PDF generation) and `qrcode` (client-side QR code generation as a data URL, for the footer).

## Data Flow

1. User clicks the (repurposed) print/export button on `RecipeDetail.tsx`.
2. A handler builds a "PDF recipe" payload from the currently-displayed recipe state — same computed values already on screen: the active language (`lang`), the active serving multiplier (`multiplier`, so a recipe scaled to 8 servings exports scaled amounts), and the already-resolved ingredient/step text (`displayRecipe`, `heUnit`/`scaleAmount` outputs). No new data-fetching or backend changes are needed - everything the PDF needs is already computed client-side for the on-screen view.
3. `qrcode`'s `toDataURL()` generates a QR code (client-side, no network call) pointing at the recipe's existing share URL (`${window.location.origin}/share/recipes/${id}`, same URL the existing Share button already uses).
4. `@react-pdf/renderer`'s `pdf(<RecipePdfDocument .../>).toBlob()` renders the document to a Blob.
5. The Blob is downloaded via a temporary `<a download>` link, named after the recipe title (e.g. `chocolate-chip-cookies.pdf`).
6. A loading state on the button covers the render time (PDF generation + QR encoding aren't instant, unlike the old synchronous `window.print()`).

## Layout (`src/components/pdf/RecipePdfDocument.tsx`)

Single A4 page (additional pages auto-flow if content overflows - `@react-pdf/renderer` paginates automatically), in the app's own palette (`amber` `#b06408`, `terra` `#b64e3a`, `herb` `#2c683c`, ink `#1c140e` on off-white `#faf8f5` — the light-mode values already defined in `src/index.css`) and typography (Cormorant Garamond for the display title, Frank Ruhl Libre for Hebrew text, Inter for body/labels — the same three families the web app already loads from Google Fonts), not the pastel palettes shown in the reference images:

- **Header**: small "Tugy's Cookbook" wordmark, thin rule beneath.
- **Title**: recipe title in the active language (Cormorant Garamond, large), cuisine/category as a small tag beneath it.
- **Meta row**: prep time, cook time, total time, servings, difficulty — icon + label pairs, laid out horizontally like every reference image's info row. Icons are simple hand-drawn `Svg`/`Path` glyphs (clock, servings/bowl, difficulty bars) rather than an icon font, since `@react-pdf/renderer` can't load arbitrary web icon fonts.
- **Hero photo**: `recipe.image`, full-width rounded rectangle.
- **Two-column body**: ingredients (left) as a checklist (small square bullet + amount + unit + name, respecting ingredient group headers and the active serving multiplier) and method (right) as numbered steps (respecting step group titles).
- **Tips section**: below the two columns, only rendered when the recipe has tips.
- **Footer** (repeated on every page, in case content overflows to a second page): wordmark + the QR code generated in the data-flow step above, linking back to the live recipe.

RTL: when `lang === 'he'`, text alignment and column order mirror (`textAlign: 'right'`, ingredients/method column swap). Hebrew is not a cursive-joining script (unlike Arabic), so this should render correctly with the right font registered and `textAlign` set — but this needs to be verified with a small spike (rendering a real Hebrew recipe to PDF and visually confirming correct glyph shaping and right-to-left reading order) before the full template is built on top of that assumption, since `@react-pdf/renderer`'s bidi/RTL support has been inconsistent across versions in the broader ecosystem.

## Font Loading

`@react-pdf/renderer` requires real font files (TTF/OTF) registered via `Font.register({ family, src })` — it cannot use the CSS `@import` the web app uses for the same families. Font files are fetched from Google Fonts' static CDN (e.g. `https://fonts.gstatic.com/s/cormorantgaramond/...ttf`, `https://fonts.gstatic.com/s/frankruhllibre/...ttf`, `https://fonts.gstatic.com/s/inter/...ttf`) at module load time in `RecipePdfDocument.tsx`, mirroring the weights already used on the web (400/500/600/700 for Cormorant Garamond, 400/500/600/700 for Frank Ruhl Libre, 400/500/600 for Inter).

## Integration Point

In `RecipeDetail.tsx`, the existing print button (`onClick={() => window.print()}`, `print:hidden`-marked so it never appears in an actual print) is replaced with the new PDF-download handler. The `print:*` CSS classes throughout `RecipeDetail.tsx` and the `@media print` block in `src/index.css` are left in place untouched — they still apply to browser printing in general (e.g. a user pressing Ctrl+P directly) and are still used by `CollectionPrintPage.tsx`, which is out of scope here.

## Testing

- No backend changes, so no API tests.
- `@react-pdf/renderer` document components have no dedicated test harness in this repo (consistent with every other pure-UI feature shipped this session) - verified by actually generating and opening a PDF for a recipe with: Hebrew content, English content, a serving multiplier applied, ingredient groups, step groups, tips present, and tips absent.
- `npm run build`/lint as the baseline gate, same as every other frontend change.

## Out of Scope

- `CollectionPrintPage.tsx` (multi-recipe booklet) - stays on the current browser-print approach; a follow-up once this template is proven.
- Any change to the general `@media print` CSS (still used for ad-hoc Ctrl+P printing and the collection booklet).
- Print-quality settings/options (paper size choice, margins, etc.) - fixed A4, matching the existing `@page` rule's assumption.
