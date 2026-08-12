# Recipe PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `RecipeDetail`'s browser-print button with a real "Download PDF" that generates a magazine-style, branded recipe page using `@react-pdf/renderer`.

**Architecture:** A self-hosted set of font files (downloaded once, committed to the repo) get registered with `@react-pdf/renderer`. A pure data-mapping function converts the app's `Recipe` type (plus the current language and serving multiplier) into a PDF-ready shape; a `Document`/`Page` component tree renders that shape into the magazine layout; a small trigger function renders it to a Blob and downloads it.

**Tech Stack:** `@react-pdf/renderer` (PDF generation), `qrcode` (client-side QR code as a data URL), React/Vite (`src/`).

## Global Constraints

- Single recipe only - `CollectionPrintPage.tsx` (the multi-recipe booklet) is untouched, stays on browser print.
- No backend changes - everything the PDF needs is already computed client-side for the on-screen `RecipeDetail` view (translated text, scaled ingredient amounts).
- Use the app's own fonts (Cormorant Garamond, Frank Ruhl Libre, Inter) and colors (amber `#B06408`, terra `#B64E3A`, herb `#2C683C`, ink `#1C140E` on `#FAF8F5`), matching `src/index.css`'s light-mode palette - not the pastel palettes in the reference images.
- Reuse existing i18n keys (`tx.prep`, `tx.cook`, `tx.servings`, `tx.level`, `tx.ingredients2`, `tx.instructions2`, `tx.siteTitle`, `tx.difficulty[...]`, `tx.categories[...]`) for on-page labels instead of inventing new translated strings that duplicate them.
- The QR code links to the same share URL the existing Share button already uses: `${window.location.origin}/share/recipes/${recipe.id}`.
- The `@media print` CSS in `src/index.css` and `print:*` Tailwind classes throughout `RecipeDetail.tsx` are left untouched - still used for ad-hoc Ctrl+P printing and by `CollectionPrintPage.tsx`.

---

### Task 1: Self-hosted fonts + PDF style/icon building blocks

**Files:**
- Create: `src/assets/fonts/cormorant-garamond-400.ttf`, `-500.ttf`, `-600.ttf`, `-700.ttf`
- Create: `src/assets/fonts/frank-ruhl-libre-400.ttf`, `-500.ttf`, `-600.ttf`, `-700.ttf`
- Create: `src/assets/fonts/inter-400.ttf`, `-500.ttf`, `-600.ttf`
- Create: `src/components/pdf/pdfStyles.ts`
- Create: `src/components/pdf/pdfIcons.tsx`
- Modify: `package.json` (new dependencies)

**Interfaces:**
- Produces (used by Task 2): `PDF_COLORS` (color constants), `pdfStyles` (a `@react-pdf/renderer` `StyleSheet`), and `ClockPdfIcon`/`ServingsPdfIcon`/`DifficultyPdfIcon` components (each taking `{ color: string; size?: number }`), all importable from `src/components/pdf/pdfStyles.ts` and `src/components/pdf/pdfIcons.tsx` respectively. Font families `'Cormorant Garamond'`, `'Frank Ruhl Libre'`, and `'Inter'` registered with `@react-pdf/renderer`'s `Font` at weights 400/500/600(/700 for the two serif families), ready to reference by name in any `@react-pdf/renderer` style.

- [ ] **Step 1: Install the new dependencies**

Run:
```bash
cd /Users/tugy/git/recipes
npm install @react-pdf/renderer qrcode
npm install --save-dev @types/qrcode
```

- [ ] **Step 2: Download and self-host the font files**

`@react-pdf/renderer` needs real TTF/OTF font files (it cannot use the CSS `@import` the web app uses for the same families) - this fetches the exact files Google Fonts serves, using an old-browser user agent so Google returns TTF instead of WOFF2:

```bash
cd /Users/tugy/git/recipes
mkdir -p src/assets/fonts

curl -sA "Mozilla/5.0 (Windows NT 6.1)" "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Frank+Ruhl+Libre:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" > /tmp/pdf-fonts.css

# Extract the TTF URLs in the order they appear (matches the order requested
# above: Cormorant Garamond 400/500/600/700, Frank Ruhl Libre 400/500/600/700,
# Inter 400/500/600 - 11 URLs total).
URLS=($(grep -oE "https://fonts\.gstatic\.com/[^)]+\.ttf" /tmp/pdf-fonts.css))
NAMES=(
  cormorant-garamond-400 cormorant-garamond-500 cormorant-garamond-600 cormorant-garamond-700
  frank-ruhl-libre-400 frank-ruhl-libre-500 frank-ruhl-libre-600 frank-ruhl-libre-700
  inter-400 inter-500 inter-600
)

for i in "${!NAMES[@]}"; do
  curl -sL "${URLS[$i]}" -o "src/assets/fonts/${NAMES[$i]}.ttf"
done

ls -la src/assets/fonts/
```

Expected: 11 `.ttf` files in `src/assets/fonts/`, each several hundred KB. If `URLS` has fewer than 11 entries (Google changed its response format), open `/tmp/pdf-fonts.css` and adjust the extraction manually - the file is plain CSS `@font-face` blocks, one per family+weight, in request order.

- [ ] **Step 3: Create the PDF style sheet and color/font registration**

Create `src/components/pdf/pdfStyles.ts`:

```typescript
import { Font, StyleSheet } from '@react-pdf/renderer'
import cormorantGaramond400 from '../../assets/fonts/cormorant-garamond-400.ttf?url'
import cormorantGaramond500 from '../../assets/fonts/cormorant-garamond-500.ttf?url'
import cormorantGaramond600 from '../../assets/fonts/cormorant-garamond-600.ttf?url'
import cormorantGaramond700 from '../../assets/fonts/cormorant-garamond-700.ttf?url'
import frankRuhlLibre400 from '../../assets/fonts/frank-ruhl-libre-400.ttf?url'
import frankRuhlLibre500 from '../../assets/fonts/frank-ruhl-libre-500.ttf?url'
import frankRuhlLibre600 from '../../assets/fonts/frank-ruhl-libre-600.ttf?url'
import frankRuhlLibre700 from '../../assets/fonts/frank-ruhl-libre-700.ttf?url'
import inter400 from '../../assets/fonts/inter-400.ttf?url'
import inter500 from '../../assets/fonts/inter-500.ttf?url'
import inter600 from '../../assets/fonts/inter-600.ttf?url'

// Font.register is a module-level side effect - importing this file once
// (from RecipePdfDocument.tsx) registers all three families before any PDF
// is rendered. @react-pdf/renderer needs real font files, not the Google
// Fonts CSS @import the web app itself uses for these same families.
Font.register({
  family: 'Cormorant Garamond',
  fonts: [
    { src: cormorantGaramond400, fontWeight: 400 },
    { src: cormorantGaramond500, fontWeight: 500 },
    { src: cormorantGaramond600, fontWeight: 600 },
    { src: cormorantGaramond700, fontWeight: 700 },
  ],
})

Font.register({
  family: 'Frank Ruhl Libre',
  fonts: [
    { src: frankRuhlLibre400, fontWeight: 400 },
    { src: frankRuhlLibre500, fontWeight: 500 },
    { src: frankRuhlLibre600, fontWeight: 600 },
    { src: frankRuhlLibre700, fontWeight: 700 },
  ],
})

Font.register({
  family: 'Inter',
  fonts: [
    { src: inter400, fontWeight: 400 },
    { src: inter500, fontWeight: 500 },
    { src: inter600, fontWeight: 600 },
  ],
})

// Matches src/index.css's light-mode --color-* custom properties, converted
// to hex - the printed page should look like this app's brand, not a
// generic template.
export const PDF_COLORS = {
  bg: '#FAF8F5',
  ink: '#1C140E',
  inkMuted: '#6B6259',
  amber: '#B06408',
  terra: '#B64E3A',
  herb: '#2C683C',
  border: '#E4DED5',
}

export const pdfStyles = StyleSheet.create({
  page: {
    backgroundColor: PDF_COLORS.bg,
    color: PDF_COLORS.ink,
    fontFamily: 'Inter',
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  wordmark: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 2,
    color: PDF_COLORS.amber,
    textTransform: 'uppercase',
  },
  headerRule: {
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    marginTop: 6,
    marginBottom: 18,
  },
  title: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 700,
    fontSize: 30,
    textAlign: 'center',
    marginBottom: 4,
  },
  tag: {
    fontFamily: 'Inter',
    fontSize: 9,
    color: PDF_COLORS.inkMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  metaText: {
    fontSize: 9,
    color: PDF_COLORS.inkMuted,
    marginLeft: 4,
  },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: 6,
    objectFit: 'cover',
    marginBottom: 20,
  },
  bodyRow: {
    flexDirection: 'row',
  },
  ingredientsCol: {
    width: '38%',
    paddingRight: 16,
  },
  methodCol: {
    width: '62%',
  },
  columnHeading: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 14,
    color: PDF_COLORS.amber,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  groupLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: PDF_COLORS.terra,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  ingredientRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  ingredientBullet: {
    width: 7,
    height: 7,
    borderWidth: 1,
    borderColor: PDF_COLORS.amber,
    marginTop: 2,
    marginRight: 6,
  },
  ingredientText: {
    fontSize: 9.5,
    lineHeight: 1.4,
    flex: 1,
  },
  stepGroupTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: PDF_COLORS.terra,
    marginTop: 10,
    marginBottom: 6,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  stepNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PDF_COLORS.amber,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 600,
    textAlign: 'center',
    lineHeight: 1.3,
    marginRight: 8,
  },
  stepText: {
    fontSize: 9.5,
    lineHeight: 1.45,
    flex: 1,
  },
  tipsSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
  },
  tipsHeading: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 12,
    color: PDF_COLORS.amber,
    marginBottom: 6,
  },
  tipRow: {
    fontSize: 9.5,
    lineHeight: 1.4,
    marginBottom: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 8,
  },
  footerWordmark: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 9,
    color: PDF_COLORS.inkMuted,
  },
  footerQr: {
    width: 32,
    height: 32,
  },
})
```

- [ ] **Step 4: Create the icon components**

Create `src/components/pdf/pdfIcons.tsx`:

```typescript
import { Svg, Path, Circle } from '@react-pdf/renderer'

interface PdfIconProps {
  color: string
  size?: number
}

export function ClockPdfIcon({ color, size = 10 }: PdfIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function ServingsPdfIcon({ color, size = 10 }: PdfIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 3v7a3 3 0 003 3v8M6 3v7M9 3v7M18 3c-2 0-3 2-3 5s1 4 3 4v9"
        stroke={color}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function DifficultyPdfIcon({ color, size = 10 }: PdfIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 20h4v-6H3v6zM10 20h4V9h-4v11zM17 20h4V4h-4v16z" fill={color} />
    </Svg>
  )
}
```

- [ ] **Step 5: Verify font registration + Hebrew rendering with a scratch script**

This is the spike the design doc calls for - confirming `@react-pdf/renderer` can actually load these fonts and render Hebrew text before Task 2 builds the full template on top of that assumption. Create a temporary file inside the repo, `src/components/pdf/_spike.tsx` (relative imports need it to live alongside `pdfStyles.ts`; the leading underscore plus deleting it in the last step keeps it out of the final deliverable):

```typescript
import { Document, Page, Text, pdf } from '@react-pdf/renderer'
import { writeFileSync } from 'fs'
import { pdfStyles } from './pdfStyles'

async function main() {
  const doc = (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={[pdfStyles.title, { textAlign: 'right' as const }]}>עוגיות שוקולד צ'יפס</Text>
        <Text style={pdfStyles.tag}>English mixed with עברית</Text>
      </Page>
    </Document>
  )
  // toBuffer() resolves to a Node Readable stream, not a Buffer directly -
  // collect its chunks before writing to disk.
  const stream = await pdf(doc).toBuffer()
  const chunks: Buffer[] = []
  stream.on('data', (chunk: Buffer) => chunks.push(chunk))
  stream.on('end', () => {
    const buffer = Buffer.concat(chunks)
    writeFileSync('/tmp/pdf-spike-output.pdf', buffer)
    console.log('wrote', buffer.length, 'bytes')
  })
  stream.on('error', (err: Error) => {
    console.error('stream error:', err)
    process.exit(1)
  })
}

main()
```

Run: `cd /Users/tugy/git/recipes && npx tsx src/components/pdf/_spike.tsx`
Expected: prints `wrote <N> bytes` with N at least 5000 (confirms the font files embedded successfully rather than silently falling back to nothing), and `/tmp/pdf-spike-output.pdf` exists. If the installed `@react-pdf/renderer` version's `toBuffer()` resolves directly to a `Buffer` instead of a stream (check the error message / the resolved value's shape if the above throws), adapt to `const buffer = await pdf(doc).toBuffer(); writeFileSync(...)` instead - either way, the goal is the same: confirm a non-trivial PDF is produced with no errors. Report the exact byte count in your task report. Delete `src/components/pdf/_spike.tsx` and `/tmp/pdf-spike-output.pdf` afterward - the script is scratch, not part of the deliverable, and `noUnusedLocals`/`noUnusedParameters` in `tsconfig.app.json` would otherwise complain about it sitting unused in `src/`.

- [ ] **Step 6: Run the frontend build to confirm the new files/deps type-check**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors (nothing consumes `pdfStyles`/`pdfIcons` yet, so this just confirms the new files themselves compile cleanly).

- [ ] **Step 7: Commit**

```bash
cd /Users/tugy/git/recipes
git add package.json package-lock.json src/assets/fonts src/components/pdf/pdfStyles.ts src/components/pdf/pdfIcons.tsx
git commit -m "feat: add self-hosted PDF fonts, styles, and icons for recipe export"
```

---

### Task 2: RecipePdfDocument + data mapping + download trigger

**Files:**
- Create: `src/components/pdf/RecipePdfDocument.tsx`
- Create: `src/lib/recipePdf.tsx`

**Interfaces:**
- Consumes: `PDF_COLORS`, `pdfStyles` from Task 1's `pdfStyles.ts`; `ClockPdfIcon`, `ServingsPdfIcon`, `DifficultyPdfIcon` from Task 1's `pdfIcons.tsx`.
- Produces (used by Task 3): `downloadRecipePdf(recipe: Recipe, lang: Lang, multiplier: number): Promise<void>` from `src/lib/recipePdf.tsx` - the only thing `RecipeDetail.tsx` needs to call.

- [ ] **Step 1: Create the PDF document component**

Create `src/components/pdf/RecipePdfDocument.tsx`:

```typescript
import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { pdfStyles, PDF_COLORS } from './pdfStyles'
import { ClockPdfIcon, ServingsPdfIcon, DifficultyPdfIcon } from './pdfIcons'
import type { PdfRecipeData } from '../../lib/recipePdf'

interface RecipePdfDocumentProps {
  data: PdfRecipeData
}

export default function RecipePdfDocument({ data }: RecipePdfDocumentProps) {
  const dirStyle = data.isRtl ? { textAlign: 'right' as const } : {}
  const rowDir = data.isRtl ? { flexDirection: 'row-reverse' as const } : {}
  const ingredientsColStyle = data.isRtl
    ? { ...pdfStyles.ingredientsCol, paddingRight: 0, paddingLeft: 16 }
    : pdfStyles.ingredientsCol

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.wordmark}>{data.brandName}</Text>
        </View>
        <View style={pdfStyles.headerRule} />

        <Text style={[pdfStyles.title, dirStyle]}>{data.title}</Text>
        {data.tag ? <Text style={pdfStyles.tag}>{data.tag}</Text> : null}

        <View style={pdfStyles.metaRow}>
          <View style={pdfStyles.metaItem}>
            <ClockPdfIcon color={PDF_COLORS.amber} />
            <Text style={pdfStyles.metaText}>{data.prepTimeText}</Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <ClockPdfIcon color={PDF_COLORS.amber} />
            <Text style={pdfStyles.metaText}>{data.cookTimeText}</Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <ServingsPdfIcon color={PDF_COLORS.amber} />
            <Text style={pdfStyles.metaText}>{data.servingsText}</Text>
          </View>
          <View style={pdfStyles.metaItem}>
            <DifficultyPdfIcon color={PDF_COLORS.amber} />
            <Text style={pdfStyles.metaText}>{data.difficultyText}</Text>
          </View>
        </View>

        {data.imageUrl && <Image src={data.imageUrl} style={pdfStyles.heroImage} />}

        <View style={[pdfStyles.bodyRow, rowDir]}>
          <View style={ingredientsColStyle}>
            <Text style={[pdfStyles.columnHeading, dirStyle]}>{data.ingredientsHeading}</Text>
            {data.ingredients.map((group, gi) => (
              <View key={gi}>
                {group.label && <Text style={[pdfStyles.groupLabel, dirStyle]}>{group.label}</Text>}
                {group.items.map((item, ii) => (
                  <View key={ii} style={[pdfStyles.ingredientRow, rowDir]}>
                    <View style={pdfStyles.ingredientBullet} />
                    <Text style={[pdfStyles.ingredientText, dirStyle]}>
                      {[item.amountText, item.unitText].filter(Boolean).join(' ')} {item.nameText}
                      {item.noteText ? ` (${item.noteText})` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <View style={pdfStyles.methodCol}>
            <Text style={[pdfStyles.columnHeading, dirStyle]}>{data.methodHeading}</Text>
            {data.steps.map((group, gi) => {
              let stepNum = 0
              return (
                <View key={gi}>
                  {group.title && <Text style={[pdfStyles.stepGroupTitle, dirStyle]}>{group.title}</Text>}
                  {group.items.map((step, si) => {
                    stepNum += 1
                    return (
                      <View key={si} style={[pdfStyles.stepRow, rowDir]}>
                        <Text style={pdfStyles.stepNumber}>{stepNum}</Text>
                        <Text style={[pdfStyles.stepText, dirStyle]}>{step.text}</Text>
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        </View>

        {data.tips && data.tips.length > 0 && (
          <View style={pdfStyles.tipsSection}>
            <Text style={[pdfStyles.tipsHeading, dirStyle]}>{data.tipsHeading}</Text>
            {data.tips.map((tip, i) => (
              <Text key={i} style={[pdfStyles.tipRow, dirStyle]}>• {tip}</Text>
            ))}
          </View>
        )}

        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerWordmark}>{data.brandName}</Text>
          <Image src={data.qrDataUrl} style={pdfStyles.footerQr} />
        </View>
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Create the data-mapping and download-trigger module**

Create `src/lib/recipePdf.tsx` (note the `.tsx` extension - this file contains JSX for the `pdf()` call):

```typescript
import { pdf } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import RecipePdfDocument from '../components/pdf/RecipePdfDocument'
import { formatTime, scaleAmount } from '../utils/format'
import { t, heUnit } from '../i18n'
import type { Recipe, Lang } from '../types'

export interface PdfIngredientItem {
  amountText: string | null
  unitText: string | null
  nameText: string
  noteText?: string
}

export interface PdfIngredientGroup {
  label?: string
  items: PdfIngredientItem[]
}

export interface PdfStepItem {
  text: string
}

export interface PdfStepGroup {
  title?: string
  items: PdfStepItem[]
}

export interface PdfRecipeData {
  title: string
  tag: string
  imageUrl?: string
  prepTimeText: string
  cookTimeText: string
  servingsText: string
  difficultyText: string
  ingredientsHeading: string
  methodHeading: string
  tipsHeading: string
  ingredients: PdfIngredientGroup[]
  steps: PdfStepGroup[]
  tips?: string[]
  isRtl: boolean
  qrDataUrl: string
  brandName: string
}

function buildPdfRecipeData(recipe: Recipe, lang: Lang, multiplier: number, qrDataUrl: string): PdfRecipeData {
  const tx = t[lang]
  const isRtl = lang === 'he'
  const title = isRtl ? (recipe.titleHe || recipe.title) : recipe.title
  const tagParts = [recipe.cuisine, tx.categories[recipe.category]].filter((v): v is string => !!v)

  const ingredients: PdfIngredientGroup[] = recipe.ingredients.map(group => ({
    label: (isRtl ? (group.group || group.groupEn) : (group.groupEn || group.group)) || undefined,
    items: group.items.map(item => {
      const scaledAmount = item.amount ? item.amount * multiplier : 0
      const unit = isRtl ? heUnit(item.unit, scaledAmount) : item.unit
      return {
        amountText: item.amount ? scaleAmount(item.amount, multiplier) : null,
        unitText: unit || null,
        nameText: isRtl ? item.name : (item.nameEn ?? item.name),
        noteText: (isRtl ? item.note : (item.noteEn ?? item.note)) || undefined,
      }
    }),
  }))

  const steps: PdfStepGroup[] = recipe.steps.map(group => ({
    title: (isRtl ? (group.title || group.titleEn) : (group.titleEn || group.title)) || undefined,
    items: group.items.map(step => ({
      text: isRtl ? step.instruction : (step.instructionEn ?? step.instruction),
    })),
  }))

  const tips = isRtl ? recipe.tips : (recipe.tipsEn ?? recipe.tips)

  return {
    title,
    tag: tagParts.join(' · '),
    imageUrl: recipe.image,
    prepTimeText: `${tx.prep} ${formatTime(recipe.prepTime)}`,
    cookTimeText: `${tx.cook} ${formatTime(recipe.cookTime)}`,
    servingsText: `${Math.round(recipe.servings * multiplier)} ${tx.servings}`,
    difficultyText: tx.difficulty[recipe.difficulty],
    ingredientsHeading: tx.ingredients2,
    methodHeading: tx.instructions2,
    tipsHeading: isRtl ? 'טיפים' : 'Tips',
    ingredients,
    steps,
    tips: tips && tips.length > 0 ? tips : undefined,
    isRtl,
    qrDataUrl,
    brandName: tx.siteTitle,
  }
}

export async function downloadRecipePdf(recipe: Recipe, lang: Lang, multiplier: number): Promise<void> {
  const shareUrl = `${window.location.origin}/share/recipes/${recipe.id}`
  const qrDataUrl = await QRCode.toDataURL(shareUrl, { margin: 1, width: 128 })
  const data = buildPdfRecipeData(recipe, lang, multiplier, qrDataUrl)
  const blob = await pdf(<RecipePdfDocument data={data} />).toBlob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const fileSafeTitle = data.title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'recipe'
  link.download = `${fileSafeTitle}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: Add the missing `tipsHeading` Hebrew/English strings to i18n instead of the inline ternary**

The inline `isRtl ? 'טיפים' : 'Tips'` in Step 2 works but doesn't match this codebase's convention of keeping all copy in `src/i18n.ts`. In `src/i18n.ts`, check whether a `tips` or `tipsHeading`-style key already exists (search for `tips:` in both the `he` and `en` blocks) — if the recipe view already has a "Tips" section heading key, reuse its exact name instead of adding a new one. If none exists, insert a new key as the last entry of each language block (before that object's closing `},`):

Hebrew block: `tipsHeading: 'טיפים',`
English block: `tipsHeading: 'Tips',`

Then in `src/lib/recipePdf.tsx`, replace:
```typescript
    tipsHeading: isRtl ? 'טיפים' : 'Tips',
```
with:
```typescript
    tipsHeading: tx.tipsHeading,
```
(or the actual existing key name if one was found).

- [ ] **Step 4: Run the frontend build**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/pdf/RecipePdfDocument.tsx src/lib/recipePdf.tsx src/i18n.ts
git commit -m "feat: add magazine-style recipe PDF document and download trigger"
```

---

### Task 3: Wire the download into RecipeDetail

**Files:**
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/i18n.ts`

**Interfaces:**
- Consumes: `downloadRecipePdf(recipe: Recipe, lang: Lang, multiplier: number): Promise<void>` from Task 2's `src/lib/recipePdf.tsx`.

- [ ] **Step 1: Add the new i18n keys**

In `src/i18n.ts`, `tx.print` is already used by `ShoppingListPanel.tsx` too, so it must not be repurposed - add fresh keys instead. Insert as the last entries of the `he` block (before its closing `},`):

```typescript
      downloadRecipePdf: 'הורדת PDF',
      generatingPdf: 'מכינים PDF...',
      pdfGenerationFailed: 'יצירת ה-PDF נכשלה, נסו שוב',
```

Insert as the last entries of the `en` block (before its closing `},`):

```typescript
    downloadRecipePdf: 'Download PDF',
    generatingPdf: 'Generating PDF...',
    pdfGenerationFailed: 'Could not generate the PDF - try again',
```

- [ ] **Step 2: Add the import and state**

In `src/components/RecipeDetail.tsx`, add the import:

```typescript
import { downloadRecipePdf } from '../lib/recipePdf'
```

Add a new state variable near the other submission-related state (e.g. right after `const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')`):

```typescript
  const [pdfGenerating, setPdfGenerating] = useState(false)
```

- [ ] **Step 3: Add the download handler**

Add this function near the existing `share` function:

```typescript
  async function handleDownloadPdf() {
    if (!displayRecipe) return
    setPdfGenerating(true)
    try {
      await downloadRecipePdf(displayRecipe, lang, multiplier)
    } catch {
      showToast(tx.pdfGenerationFailed, 'error')
    } finally {
      setPdfGenerating(false)
    }
  }
```

- [ ] **Step 4: Replace the print button**

Find the existing print button:

```tsx
            <button type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              {tx.print}
            </button>
```

Replace it with:

```tsx
            <button type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={pdfGenerating}
              className="flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              {pdfGenerating ? tx.generatingPdf : tx.downloadRecipePdf}
            </button>
```

- [ ] **Step 5: Run the frontend build**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 6: Run the react-hooks lint check (matches the CI gate)**

Run:
```bash
cd /Users/tugy/git/recipes
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-report.json
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-report.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
if (hookIssues.length > 0) { console.error('React Hooks rule violations found:'); console.error(JSON.stringify(hookIssues, null, 2)); process.exit(1); }
console.log('No react-hooks violations found.');
"
```
Expected: `No react-hooks violations found.`

- [ ] **Step 7: Manually verify in the browser**

Run: `cd /Users/tugy/git/recipes && npm run dev` (if not already running). Open a recipe with a photo, ingredients in multiple groups, numbered steps in multiple groups, and tips. Click "Download PDF" (English) and confirm a PDF file downloads and opens correctly: title, meta row with icons, photo, two-column ingredients/method, tips section, and a footer with the wordmark and a QR code. Switch the site to Hebrew and repeat - confirm the Hebrew text renders with correct glyphs (not boxes/missing-glyph marks) and right-to-left alignment. Try a recipe with no photo and confirm the layout doesn't leave an awkward gap. Try scaling the servings multiplier before downloading and confirm the ingredient amounts in the PDF reflect the scaled amounts.

- [ ] **Step 8: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/RecipeDetail.tsx src/i18n.ts
git commit -m "feat: replace RecipeDetail's browser-print button with branded PDF download"
```

---

## Self-Review Notes

- **Spec coverage:** self-hosted fonts + font registration (Task 1), the full magazine layout with icon meta row/hero photo/two-column body/tips/QR footer (Task 2), RTL mirroring (Task 2's `dirStyle`/`rowDir`/`ingredientsColStyle`), integration replacing the print button (Task 3), the design's explicitly-called-out RTL verification spike (Task 1 Step 5). `CollectionPrintPage.tsx` and the general `@media print` CSS are untouched, matching the spec's stated out-of-scope.
- **Type consistency:** `PdfRecipeData`/`PdfIngredientGroup`/`PdfIngredientItem`/`PdfStepGroup`/`PdfStepItem` (Task 2's `recipePdf.tsx`) match exactly what `RecipePdfDocument.tsx` (also Task 2) destructures and renders. `downloadRecipePdf`'s signature matches exactly how Task 3's `handleDownloadPdf` calls it.
- **No placeholders:** every step has literal code or a fully concrete, directly-runnable command - including the font-download step, which fetches real values via a verified-working command rather than hardcoding a Google Fonts CDN hash that could go stale.
