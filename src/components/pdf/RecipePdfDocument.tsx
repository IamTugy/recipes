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
