import { Injectable } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import { NutritionEstimateRequestDto } from './nutrition-estimate.dto'

export interface NutritionEstimate {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

const PROMPT = `You are a nutritionist estimating the nutritional content of a recipe from its ingredient list. Given the ingredients and the number of servings the recipe makes, estimate the nutrition PER SERVING and produce a single JSON object with exactly these fields (omit any field you cannot reasonably estimate):

{
  "calories": "number, kcal per serving",
  "protein": "number, grams per serving",
  "carbs": "number, grams per serving",
  "fat": "number, grams per serving"
}

Base the estimate on standard nutritional data for the listed ingredients and their amounts, divided across the servings. Respond with ONLY the JSON object, no other text.

Servings: `

@Injectable()
export class NutritionService {
  constructor(private readonly gemini: GeminiService) {}

  async estimate({ ingredients, servings }: NutritionEstimateRequestDto): Promise<NutritionEstimate> {
    const ingredientLines = ingredients
      .flatMap(group => group.items.map(item => `- ${[item.amount, item.unit, item.name].filter(Boolean).join(' ')}`))
      .join('\n')
    const prompt = `${PROMPT}${servings ?? 'unknown, assume 4'}\n\nIngredients:\n${ingredientLines}`
    return this.gemini.generateStructured<NutritionEstimate>(prompt)
  }
}
