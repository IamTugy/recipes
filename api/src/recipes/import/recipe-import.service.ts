import { Injectable, BadRequestException } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import { extractFromUrl, extractFromPdf, extractFromDocx, isSocialMediaUrl, extractTikTokOembed, type ImportedRecipe } from './source-extractor'

const EXTRACTION_PROMPT = `You are extracting a cooking recipe from raw text into a strict JSON object. Read the following source text and produce a single JSON object with exactly these fields (omit any field you cannot determine, but always include "title"):

{
  "title": "string, English title (required)",
  "titleHe": "string, Hebrew title",
  "category": "one of: breakfast, lunch, dinner, dessert, salad, soup, snack, bread, sauce",
  "tags": ["Hebrew tags"],
  "tagsEn": ["English tags"],
  "cuisine": "string, e.g. Italian, Brazilian",
  "description": "string, Hebrew short description",
  "descriptionEn": "string, English short description",
  "prepTime": "number, minutes",
  "cookTime": "number, minutes",
  "servings": "number",
  "difficulty": "one of: easy, medium, hard",
  "kosherType": "one of: meat, dairy, parve - meat if it contains any meat, poultry, or fish; dairy if it contains dairy and no meat/poultry/fish of any kind; parve if it contains neither. Omit only if you genuinely cannot tell.",
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string - but ONLY leave it empty for a naturally countable whole item (e.g. \"1 onion\", \"10 grapes\", \"1 garlic clove\"). Never leave it empty for something measured by mass or volume (e.g. milk, butter, flour, oil) - \"1 milk\" or \"1 butter\" with no unit is wrong, use g/ml/etc for those.", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if this step mentions a specific duration" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

Always fill in both the Hebrew and English version of every text field, translating as needed if the source is only in one language. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Respond with ONLY the JSON object, no other text.

Source text:
`

const JSON_LD_TO_RECIPE_PROMPT = `You are converting a schema.org Recipe JSON-LD object into a strict JSON object matching this exact shape (omit fields you cannot determine, but always include "title"):

{
  "title": "string, English title (required)",
  "titleHe": "string, Hebrew title",
  "category": "one of: breakfast, lunch, dinner, dessert, salad, soup, snack, bread, sauce",
  "tags": ["Hebrew tags"],
  "tagsEn": ["English tags"],
  "cuisine": "string",
  "description": "string, Hebrew short description",
  "descriptionEn": "string, English short description",
  "prepTime": "number, minutes",
  "cookTime": "number, minutes",
  "servings": "number",
  "difficulty": "one of: easy, medium, hard",
  "kosherType": "one of: meat, dairy, parve - meat if it contains any meat, poultry, or fish; dairy if it contains dairy and no meat/poultry/fish of any kind; parve if it contains neither. Omit only if you genuinely cannot tell.",
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string - but ONLY leave it empty for a naturally countable whole item (e.g. \"1 onion\", \"10 grapes\", \"1 garlic clove\"). Never leave it empty for something measured by mass or volume (e.g. milk, butter, flour, oil) - \"1 milk\" or \"1 butter\" with no unit is wrong, use g/ml/etc for those.", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if mentioned" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

The source is normally in English - translate every field into Hebrew as well as keeping the English version. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Respond with ONLY the JSON object, no other text.

Source JSON-LD:
`

const IMAGE_EXTRACTION_PROMPT = `You are reading a photo of a recipe (a cookbook page, a handwritten card, a screenshot, etc.) and extracting it into a strict JSON object. Produce a single JSON object with exactly these fields (omit any field you cannot determine, but always include "title"):

{
  "title": "string, English title (required)",
  "titleHe": "string, Hebrew title",
  "category": "one of: breakfast, lunch, dinner, dessert, salad, soup, snack, bread, sauce",
  "tags": ["Hebrew tags"],
  "tagsEn": ["English tags"],
  "cuisine": "string, e.g. Italian, Brazilian",
  "description": "string, Hebrew short description",
  "descriptionEn": "string, English short description",
  "prepTime": "number, minutes",
  "cookTime": "number, minutes",
  "servings": "number",
  "difficulty": "one of: easy, medium, hard",
  "kosherType": "one of: meat, dairy, parve - meat if it contains any meat, poultry, or fish; dairy if it contains dairy and no meat/poultry/fish of any kind; parve if it contains neither. Omit only if you genuinely cannot tell.",
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string - but ONLY leave it empty for a naturally countable whole item (e.g. \"1 onion\", \"10 grapes\", \"1 garlic clove\"). Never leave it empty for something measured by mass or volume (e.g. milk, butter, flour, oil) - \"1 milk\" or \"1 butter\" with no unit is wrong, use g/ml/etc for those.", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if this step mentions a specific duration" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

Always fill in both the Hebrew and English version of every text field, translating as needed if the source is only in one language. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Do not set "image" - it is not part of this object. Respond with ONLY the JSON object, no other text.`

@Injectable()
export class RecipeImportService {
  constructor(private readonly gemini: GeminiService) {}

  async importFromText(text: string): Promise<ImportedRecipe> {
    return this.gemini.generateStructured<ImportedRecipe>(`${EXTRACTION_PROMPT}${text}`)
  }

  // captionText is the text the OS share sheet hands along with the link
  // (e.g. an Instagram/TikTok caption) - it's the richest signal available
  // for social posts, since those pages can't be fetched directly.
  async importFromUrl(url: string, captionText?: string): Promise<ImportedRecipe> {
    if (isSocialMediaUrl(url)) {
      return this.importFromSocialUrl(url, captionText)
    }
    const { text, structured } = await extractFromUrl(url)
    if (structured) {
      return this.gemini.generateStructured<ImportedRecipe>(`${JSON_LD_TO_RECIPE_PROMPT}${JSON.stringify(structured)}`)
    }
    return this.importFromText(captionText ? `${captionText}\n\n${text}` : text)
  }

  // Instagram/Facebook/TikTok post pages are JS-rendered and often
  // auth-walled, so there is no reliable server-side fetch here. Instead this
  // combines whatever caption text was shared, TikTok's public oEmbed title
  // (Instagram/Facebook oEmbed both require a Meta access token, so those are
  // skipped), and a Gemini web-search pass grounded on the post URL - then
  // feeds the combined text through the normal text-extraction prompt.
  async importFromSocialUrl(url: string, captionText?: string): Promise<ImportedRecipe> {
    const [oembedText, search] = await Promise.all([
      extractTikTokOembed(url),
      this.gemini.generateWithSearch(
        `Find the cooking recipe posted at this social media link: ${url}\n` +
          'Search for the post\'s caption and any linked description or comments that contain the recipe. ' +
          'Reply in plain text with everything you find: the full caption, ingredient list, and instructions, in as much detail as possible. ' +
          'If you cannot find the actual recipe content, say so plainly instead of guessing.',
      ),
    ])
    const combined = [captionText, oembedText, search.text].filter(Boolean).join('\n\n')
    if (!combined.trim()) {
      throw new BadRequestException('Could not find recipe content for that link - try sharing again with the caption text included, or paste the caption in manually.')
    }
    return this.importFromText(combined)
  }

  async importFromFile(buffer: Buffer, mimeType: string, promptText?: string): Promise<ImportedRecipe> {
    let text: string
    if (mimeType === 'application/pdf') {
      text = await extractFromPdf(buffer)
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      text = await extractFromDocx(buffer)
    } else {
      throw new BadRequestException(`Unsupported file type: ${mimeType}. Only PDF and DOCX are supported.`)
    }
    if (!text.trim()) {
      throw new BadRequestException('Could not find any text in that file - it may be a scanned image with no text layer.')
    }
    const combined = promptText ? `${promptText}\n\n${text}` : text
    return this.importFromText(combined)
  }

  async importFromImage(buffer: Buffer, mimeType: string, promptText?: string): Promise<ImportedRecipe> {
    const prompt = promptText
      ? `${IMAGE_EXTRACTION_PROMPT}\n\nAdditional instructions from the user: ${promptText}`
      : IMAGE_EXTRACTION_PROMPT
    return this.gemini.generateStructuredWithImage<ImportedRecipe>(prompt, buffer.toString('base64'), mimeType)
  }
}
