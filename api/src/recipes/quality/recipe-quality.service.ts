import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GeminiService } from '../../ai/gemini.service'

export type FindingSeverity = 'critical' | 'major' | 'minor'

export interface QualityFinding {
  category: string
  severity: FindingSeverity
  message: string
  field?: string
}

export interface QualityReview {
  score: number
  checkedAt: string
  findings: QualityFinding[]
  suggestedFields?: Record<string, unknown>
}

interface GeminiReviewResponse {
  findings: QualityFinding[]
  suggestedFields?: Record<string, unknown>
}

// Fixed point deduction per finding severity - the score is computed here,
// not by asking Gemini to freehand a percentage, so it's consistent and
// auditable across calls instead of a black-box number the model invents.
const PENALTY: Record<FindingSeverity, number> = { critical: 25, major: 10, minor: 3 }

const REVIEW_PROMPT = `You are reviewing a home-cooking recipe submission before it's allowed to publish on a recipe-sharing app. You are given the recipe's photo and its full content as JSON below.

Check for all of the following and report a finding for each problem you find (no finding for things that are fine):

- Quantities that don't make sense (wildly wrong amount for the dish, or for the stated servings)
- The photo doesn't look like real food, is low quality/blurry/unusable, or doesn't match the dish described
- Missing or incomplete steps for a dish that clearly needs them
- Steps that would benefit from a timer but have none set - check the actual "timerMinutes" field on that step in the JSON before flagging this; if it's already a number, the timer is set and this is NOT a finding, regardless of how the instruction text reads (use judgment on which steps need one at all - not every step does)
- Ingredients listed but never referenced in any step, or a step referencing an ingredient that isn't listed
- Duplicate or near-duplicate ingredient entries
- An ingredient with an empty unit where that's actually wrong: empty unit is fine for a naturally countable whole item ("1 onion", "10 grapes", "1 garlic clove"), but wrong for something measured by mass/volume ("1 milk" or "1 butter" needs a unit like g or ml)
- The exact same source URL appearing more than once in "sources"
- Servings count doesn't match the scale of the ingredient quantities
- Category or difficulty tag doesn't match the actual content
- Prep/cook time is implausible for what the steps describe
- Poor translation quality or missing translation between the Hebrew and English fields (if both are present)
- Inappropriate, offensive, or 18+ content anywhere in the text

Be exhaustive: go through every check in the list above one by one and report every problem you find, not just the most obvious ones. The owner only gets to see this list once per submission, so a check that's silently skipped this round means a real problem ships or comes back as a surprise on a future resubmission - don't hold anything back for a "later" pass.

For each finding, set "severity" to "critical" (recipe is unusable/wrong/inappropriate as-is), "major" (a real problem but the recipe is still usable), or "minor" (small polish issue).

If you can confidently fix a finding by rewriting the affected field(s), include your fix in "suggestedFields". Only include fields you're actually suggesting a change for. If you suggest a change to ingredients or steps, include the ENTIRE corrected ingredients or steps array in that field (not just the changed item) - it fully replaces the current value, it is not a partial patch.

Return ONLY JSON matching this shape:
{"findings": [{"category": string, "severity": "critical"|"major"|"minor", "message": string, "field": string (optional)}], "suggestedFields": object (optional)}

Recipe JSON:
`

@Injectable()
export class RecipeQualityService {
  private readonly publicUrl: string

  constructor(
    private readonly gemini: GeminiService,
    private readonly config: ConfigService,
  ) {
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL')!
  }

  async review(recipe: Record<string, unknown>): Promise<QualityReview> {
    const imageUrl = String(recipe.image ?? '')
    const { data, mimeType } = await this.fetchImage(imageUrl)

    const prompt = `${REVIEW_PROMPT}${JSON.stringify(recipe)}`
    // Low temperature: this is a checklist pass, not creative writing - keeping
    // it near-deterministic means a resubmission with the same unresolved
    // issue reliably surfaces it again instead of the model happening to omit
    // it on one call and report it on the next.
    const response = await this.gemini.generateStructuredWithImage<GeminiReviewResponse>(prompt, data, mimeType, 0)
    const findings = response.findings ?? []
    const score = this.computeScore(findings)

    return {
      score,
      checkedAt: new Date().toISOString(),
      findings,
      suggestedFields: response.suggestedFields,
    }
  }

  private computeScore(findings: QualityFinding[]): number {
    const deduction = findings.reduce((sum, f) => sum + (PENALTY[f.severity] ?? 0), 0)
    return Math.max(0, 100 - deduction)
  }

  private async fetchImage(imageUrl: string): Promise<{ data: string; mimeType: string }> {
    if (!imageUrl.startsWith(`${this.publicUrl}/`)) {
      throw new Error('Recipe image must be an uploaded photo')
    }
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error('Could not fetch the recipe image')
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
    return { data: buffer.toString('base64'), mimeType }
  }
}
