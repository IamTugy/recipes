import { Document, Page, View, Text, Image } from '@react-pdf/renderer'
import { pdfStyles, PDF_COLORS } from './pdfStyles'
import { ClockPdfIcon, ServingsPdfIcon, DifficultyPdfIcon } from './pdfIcons'
import type { PdfRecipeData } from '../../lib/recipePdf'

interface RecipePdfDocumentProps {
  data: PdfRecipeData
}

export default function RecipePdfDocument({ data }: RecipePdfDocumentProps) {
  // Cormorant Garamond and Inter (the two Latin-only families pdfStyles.ts
  // otherwise uses everywhere) have no Hebrew glyphs - only Frank Ruhl
  // Libre does. Every piece of text that can carry Hebrew content (titles,
  // headings, ingredient/step/tip text, meta labels, the brand wordmark)
  // needs this override or it renders as tofu/mismapped glyphs instead of
  // real Hebrew letters.
  const dirStyle = data.isRtl ? { textAlign: 'right' as const, fontFamily: 'Frank Ruhl Libre' } : {}
  const rtlFont = data.isRtl ? { fontFamily: 'Frank Ruhl Libre' } : {}
  const rowDir = data.isRtl ? { flexDirection: 'row-reverse' as const } : {}
  // ingredientBullet/stepNumber carry their own marginRight to space them from
  // the text that follows in LTR - when rowDir flips the row to row-reverse
  // for Hebrew, that margin needs to flip sides too or the gap lands on the
  // wrong side of the badge.
  const bulletMargin = data.isRtl ? { marginRight: 0, marginLeft: 6 } : {}
  const stepNumberMargin = data.isRtl ? { marginRight: 0, marginLeft: 8 } : {}
  // metaText carries marginLeft to space it from its icon in LTR - when
  // rowDir flips metaItem to row-reverse for Hebrew, that margin needs to
  // flip sides too or the icon and label end up touching with no gap.
  const metaTextMargin = data.isRtl ? { marginLeft: 0, marginRight: 4 } : {}
  const ingredientsColStyle = data.isRtl
    ? { ...pdfStyles.ingredientsCol, paddingRight: 0, paddingLeft: 16 }
    : pdfStyles.ingredientsCol
  // Numbered continuously across all step groups, matching the screen
  // (RecipeDetail.tsx), where group 2 continues from group 1's last number
  // instead of restarting at 1. Computed up front (rather than mutating a
  // counter inside the JSX map below) per the react-hooks/immutability rule.
  let stepCounter = 0
  const stepNumsByGroup = data.steps.map(group => group.items.map(() => ++stepCounter))

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={[pdfStyles.wordmark, rtlFont]}>{data.brandName}</Text>
        </View>
        <View style={pdfStyles.headerRule} />

        <Text style={[pdfStyles.title, rtlFont]}>{data.title}</Text>
        {data.tag ? <Text style={[pdfStyles.tag, rtlFont]}>{data.tag}</Text> : null}

        <View style={pdfStyles.metaRow}>
          <View style={[pdfStyles.metaItem, rowDir]}>
            <ClockPdfIcon color={PDF_COLORS.amber} />
            <Text style={[pdfStyles.metaText, rtlFont, metaTextMargin]}>{data.prepTimeText}</Text>
          </View>
          <View style={[pdfStyles.metaItem, rowDir]}>
            <ClockPdfIcon color={PDF_COLORS.amber} />
            <Text style={[pdfStyles.metaText, rtlFont, metaTextMargin]}>{data.cookTimeText}</Text>
          </View>
          <View style={[pdfStyles.metaItem, rowDir]}>
            <ClockPdfIcon color={PDF_COLORS.amber} />
            <Text style={[pdfStyles.metaText, rtlFont, metaTextMargin]}>{data.totalTimeText}</Text>
          </View>
          <View style={[pdfStyles.metaItem, rowDir]}>
            <ServingsPdfIcon color={PDF_COLORS.amber} />
            <Text style={[pdfStyles.metaText, rtlFont, metaTextMargin]}>{data.servingsText}</Text>
          </View>
          <View style={[pdfStyles.metaItem, rowDir]}>
            <DifficultyPdfIcon color={PDF_COLORS.amber} />
            <Text style={[pdfStyles.metaText, rtlFont, metaTextMargin]}>{data.difficultyText}</Text>
          </View>
        </View>

        {data.imageUrl && <Image src={data.imageUrl} style={pdfStyles.heroImage} />}

        <View style={[pdfStyles.bodyRow, rowDir]}>
          <View style={ingredientsColStyle}>
            <Text style={[pdfStyles.columnHeading, dirStyle]}>{data.ingredientsHeading}</Text>
            {data.ingredients.map((group, gi) => (
              <View key={gi}>
                {group.label && <Text style={[pdfStyles.groupLabel, dirStyle]}>{group.label}</Text>}
                {group.items.map((item, ii) => {
                  const amountUnitText = [item.amountText, item.unitText].filter(Boolean).join(' ')
                  return (
                    <View key={ii} style={[pdfStyles.ingredientRow, rowDir]}>
                      <View style={[pdfStyles.ingredientBullet, bulletMargin]} />
                      <Text style={[pdfStyles.ingredientText, dirStyle]}>
                        {amountUnitText ? `${amountUnitText} ` : ''}{item.nameText}
                        {item.noteText ? ` (${item.noteText})` : ''}
                      </Text>
                    </View>
                  )
                })}
              </View>
            ))}
          </View>

          <View style={pdfStyles.methodCol}>
            <Text style={[pdfStyles.columnHeading, dirStyle]}>{data.methodHeading}</Text>
            {data.steps.map((group, gi) => (
              <View key={gi}>
                {group.title && <Text style={[pdfStyles.stepGroupTitle, dirStyle]}>{group.title}</Text>}
                {group.items.map((step, si) => (
                  <View key={si} style={[pdfStyles.stepRow, rowDir]}>
                    <Text style={[pdfStyles.stepNumber, stepNumberMargin]}>{stepNumsByGroup[gi][si]}</Text>
                    <Text style={[pdfStyles.stepText, dirStyle]}>{step.text}</Text>
                  </View>
                ))}
              </View>
            ))}
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
          <Text style={[pdfStyles.footerWordmark, rtlFont]}>{data.brandName}</Text>
          <Image src={data.qrDataUrl} style={pdfStyles.footerQr} />
        </View>
      </Page>
    </Document>
  )
}
