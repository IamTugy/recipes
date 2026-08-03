import { Injectable, BadRequestException } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import { extractFromUrl, extractFromPdf, extractFromDocx, type ImportedRecipe } from './source-extractor'

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
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string if the ingredient has no unit (e.g. \"1 onion\")", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
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
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string if the ingredient has no unit (e.g. \"1 onion\")", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if mentioned" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

The source is normally in English - translate every field into Hebrew as well as keeping the English version. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Respond with ONLY the JSON object, no other text.

Source JSON-LD:
`

@Injectable()
export class RecipeImportService {
  constructor(private readonly gemini: GeminiService) {}

  async importFromText(text: string): Promise<ImportedRecipe> {
    return this.gemini.generateStructured<ImportedRecipe>(`${EXTRACTION_PROMPT}${text}`)
  }

  async importFromUrl(url: string): Promise<ImportedRecipe> {
    const { text, structured } = await extractFromUrl(url)
    if (structured) {
      return this.gemini.generateStructured<ImportedRecipe>(`${JSON_LD_TO_RECIPE_PROMPT}${JSON.stringify(structured)}`)
    }
    return this.importFromText(text)
  }

  async importFromFile(buffer: Buffer, mimeType: string): Promise<ImportedRecipe> {
    let text: string
    if (mimeType === 'application/pdf') {
      text = await extractFromPdf(buffer)
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      text = await extractFromDocx(buffer)
    } else {
      throw new BadRequestException(`Unsupported file type: ${mimeType}. Only PDF and DOCX are supported.`)
    }
    return this.importFromText(text)
  }
}
