import { Injectable, BadRequestException } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import { extractFromUrl, extractFromPdf, extractFromDocx, isSocialMediaUrl, extractTikTokOembed, type ImportedRecipe } from './source-extractor'

// Mutates recipe.ingredients[groupIndex].items[itemIndex].linkedRecipeId in
// place - shared by any caller applying a LinkMatch (recipe import,
// AI-generate). Out-of-range indices (a hallucinated match) are silently
// ignored rather than throwing, since a missed/bad link is a no-op, not a
// failure worth failing the whole batch over.
export function applyRecipeLink(recipe: ImportedRecipe, groupIndex: number, itemIndex: number, linkedRecipeId: string): void {
  const item = recipe.ingredients?.[groupIndex]?.items?.[itemIndex]
  if (item) item.linkedRecipeId = linkedRecipeId
}

const RECIPE_SHAPE = `{
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
}`

const MULTI_RECIPE_INSTRUCTION = `The source may describe one recipe or several (e.g. a cooking-class handout, a cookbook excerpt, or a page listing multiple numbered dishes). Also treat a sauce/dressing/component that's written as its own distinct, separately-titled entry as its own recipe, even if a dish above references it - don't fold it into the dish it's used in. Produce one object per distinct recipe you find, and return them all as a "recipes" array: {"recipes": [{...}, {...}]}. A single-recipe source still returns an array with one item.`

const EXTRACTION_PROMPT = `You are extracting cooking recipes from raw text. Read the following source text and produce a strict JSON object of the shape below, where each recipe object has exactly these fields (omit any field you cannot determine, but always include "title"):

${RECIPE_SHAPE}

${MULTI_RECIPE_INSTRUCTION}

Always fill in both the Hebrew and English version of every text field, translating as needed if the source is only in one language. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Respond with ONLY the JSON object, no other text.

Source text:
`

const JSON_LD_TO_RECIPE_PROMPT = `You are converting a schema.org Recipe JSON-LD object into a strict JSON object. Page markup like this always describes exactly one recipe - produce a "recipes" array with exactly one item of this shape (omit fields you cannot determine, but always include "title"):

${RECIPE_SHAPE}

Return {"recipes": [{...}]}. The source is normally in English - translate every field into Hebrew as well as keeping the English version. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Respond with ONLY the JSON object, no other text.

Source JSON-LD:
`

const IMAGE_EXTRACTION_PROMPT = `You are reading a photo of a recipe (a cookbook page, a handwritten card, a screenshot, etc.) and extracting it into a strict JSON object, where each recipe object has exactly these fields (omit any field you cannot determine, but always include "title"):

${RECIPE_SHAPE}

${MULTI_RECIPE_INSTRUCTION}

Always fill in both the Hebrew and English version of every text field, translating as needed if the source is only in one language. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Do not set "image" - it is not part of this object. Respond with ONLY the JSON object, no other text.`

interface MultiRecipeResponse {
  recipes: ImportedRecipe[]
}

export interface LinkCandidate {
  id: string
  title: string
  titleHe?: string
}

export interface LinkMatch {
  recipeIndex: number
  groupIndex: number
  itemIndex: number
  linkToRecipeIndex?: number
  linkToExistingId?: string
}

const LINK_MATCH_PROMPT = `You are matching recipe ingredients to other whole recipes. You're given a batch of recipes (0-indexed) and a list of existing recipes already saved in the app. Find ingredient items that actually refer to another whole recipe as a component - e.g. an ingredient item named "dipping sauce" or "pizza dough" where that's really a reference to a separate recipe for that sauce/dough, not just a plain ingredient. Only match when you're genuinely confident: a plain ingredient that happens to share a word with an existing recipe's title is NOT a match (e.g. "chicken stock" as a measured ingredient should not match a recipe titled "Chicken Stock" unless the dish's own text makes clear it means the prepared component). A recipe never links to itself, and never link two items to each other in a cycle.

For every confident match, add one entry to a "links" array:
{"recipeIndex": <index into "recipes" of the recipe whose ingredient links out>, "groupIndex": <its ingredient group index>, "itemIndex": <item index within that group>, "linkToRecipeIndex": <index into "recipes", if the match is another recipe in this same batch> OR "linkToExistingId": <id string, if the match is one of the existing app recipes>}

Return ONLY JSON: {"links": [...]}. If there are no confident matches, return {"links": []}.

Recipes in this batch:
`

@Injectable()
export class RecipeImportService {
  constructor(private readonly gemini: GeminiService) {}

  // Only worth a Gemini call when there's more than one recipe to
  // cross-reference within the batch, or an existing library to match
  // against - a single freshly-imported recipe with no existing recipes to
  // compare to has nothing to link.
  async resolveLinks(recipes: ImportedRecipe[], candidates: LinkCandidate[]): Promise<LinkMatch[]> {
    if (recipes.length < 2 && candidates.length === 0) return []
    const recipeSummaries = recipes.map((r, index) => ({
      index,
      title: r.title,
      titleHe: r.titleHe,
      ingredients: (r.ingredients ?? []).map((g, groupIndex) => ({
        groupIndex,
        items: (g.items ?? []).map((item, itemIndex) => ({ itemIndex, name: item.name, nameEn: item.nameEn })),
      })),
    }))
    const prompt = `${LINK_MATCH_PROMPT}${JSON.stringify(recipeSummaries)}\n\nExisting recipes already in the app:\n${JSON.stringify(candidates)}`
    const { links } = await this.gemini.generateStructured<{ links?: LinkMatch[] }>(prompt)
    return links ?? []
  }

  async importFromText(text: string): Promise<ImportedRecipe[]> {
    const { recipes } = await this.gemini.generateStructured<MultiRecipeResponse>(`${EXTRACTION_PROMPT}${text}`)
    if (!recipes?.length) throw new BadRequestException('Could not find a recipe in that text')
    return recipes
  }

  // captionText is the text the OS share sheet hands along with the link
  // (e.g. an Instagram/TikTok caption) - it's the richest signal available
  // for social posts, since those pages can't be fetched directly.
  async importFromUrl(url: string, captionText?: string): Promise<ImportedRecipe[]> {
    if (isSocialMediaUrl(url)) {
      return this.importFromSocialUrl(url, captionText)
    }
    const { text, structured } = await extractFromUrl(url)
    if (structured) {
      const { recipes } = await this.gemini.generateStructured<MultiRecipeResponse>(`${JSON_LD_TO_RECIPE_PROMPT}${JSON.stringify(structured)}`)
      if (!recipes?.length) throw new BadRequestException('Could not find a recipe at that URL')
      return recipes
    }
    return this.importFromText(captionText ? `${captionText}\n\n${text}` : text)
  }

  // Instagram/Facebook/TikTok post pages are JS-rendered and often
  // auth-walled, so there is no reliable server-side fetch here. Instead this
  // combines whatever caption text was shared, TikTok's public oEmbed title
  // (Instagram/Facebook oEmbed both require a Meta access token, so those are
  // skipped), and a Gemini web-search pass grounded on the post URL - then
  // feeds the combined text through the normal text-extraction prompt.
  async importFromSocialUrl(url: string, captionText?: string): Promise<ImportedRecipe[]> {
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

  async importFromFile(buffer: Buffer, mimeType: string, promptText?: string): Promise<ImportedRecipe[]> {
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

  async importFromImage(buffer: Buffer, mimeType: string, promptText?: string): Promise<ImportedRecipe[]> {
    const prompt = promptText
      ? `${IMAGE_EXTRACTION_PROMPT}\n\nAdditional instructions from the user: ${promptText}`
      : IMAGE_EXTRACTION_PROMPT
    const { recipes } = await this.gemini.generateStructuredWithImage<MultiRecipeResponse>(prompt, buffer.toString('base64'), mimeType)
    if (!recipes?.length) throw new BadRequestException('Could not find a recipe in that photo')
    return recipes
  }
}
