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
    paddingBottom: 28,
    paddingHorizontal: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerQr: {
    position: 'absolute',
    top: 36,
    right: 40,
    width: 40,
    height: 40,
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
    width: '70%',
    alignSelf: 'center',
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stepNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PDF_COLORS.amber,
    justifyContent: 'center',
    alignItems: 'center',
    // stepText's first line is shorter than this circle's height, so top-
    // aligning both (the row's default) leaves the circle sitting visibly
    // lower than the line of text beside it - this pulls it back up to
    // center on that first line instead.
    marginTop: -2,
    marginRight: 8,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 600,
    textAlign: 'center',
    lineHeight: 1,
  },
  stepText: {
    fontSize: 9.5,
    lineHeight: 1.45,
    flex: 1,
  },
  tipsSection: {
    marginTop: 14,
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
})
