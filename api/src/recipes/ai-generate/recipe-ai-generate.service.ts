import { Injectable } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import type { ImportedRecipe } from '../import/source-extractor'

const RESEARCH_PROMPT = `You are a professional recipe researcher. Use Google Search to find the best existing recipe (or the best combination of a few similar recipes) for the following request. Do not invent a recipe from imagination - base it on what real recipe sites/videos actually say. Write up the resulting recipe in full detail: title, a short description, cuisine, category, prep/cook time, servings, difficulty, full ingredient list with amounts and units, and full step-by-step instructions. Mention which sources you drew from.

Request: `

const STRUCTURE_PROMPT = `Convert the following recipe write-up into a strict JSON object matching this exact shape (omit fields you cannot determine, but always include "title"):

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
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string if the ingredient has no unit (e.g. \\"1 onion\\")", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if this step mentions a specific duration" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

Always fill in both the Hebrew and English version of every text field, translating as needed. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Do not include a "sources" field - sources are attached separately. Respond with ONLY the JSON object, no other text.

Recipe write-up:
`

export interface AiGeneratedRecipe extends ImportedRecipe {
  aiGenerated: true
  sources: { title: string; url: string }[]
}

@Injectable()
export class RecipeAiGenerateService {
  constructor(private readonly gemini: GeminiService) {}

  // Two-step because the Gemini API rejects combining the googleSearch tool
  // with JSON-constrained output: first research the request with live
  // search grounding (free-text result + cited source URLs), then convert
  // that write-up into the app's strict recipe JSON shape.
  async generate(query: string): Promise<AiGeneratedRecipe> {
    const { text, sources } = await this.gemini.generateWithSearch(`${RESEARCH_PROMPT}${query}`)
    const structured = await this.gemini.generateStructured<ImportedRecipe>(`${STRUCTURE_PROMPT}${text}`)
    return { ...structured, aiGenerated: true, sources }
  }
}
