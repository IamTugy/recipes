import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from '../schemas/recipe.schema'
import { GeminiService } from '../../ai/gemini.service'
import { ingredientQuantityScore, ingredientNameScore, titleSimilarityScore, isDuplicateCandidate } from './similarity-scoring'

const MAX_CANDIDATES = 5

export interface SimilarityIngredientGroup {
  items: { name?: string; unit?: string; amount?: number }[]
}

export interface SimilaritySourceRecipe {
  title?: string
  titleHe?: string
  ingredients?: SimilarityIngredientGroup[]
  steps?: unknown
  ownerId?: string
}

export interface SimilarityCandidate {
  id: string
  title: string
  titleHe?: string
  ingredients: SimilarityIngredientGroup[]
  steps: unknown
}

export interface DuplicateVerdict {
  isDuplicate: boolean
  matchedRecipeId?: string
  reason: string
}

interface CandidateDoc {
  _id: { toString(): string }
  title: string
  titleHe?: string
  ingredients: SimilarityIngredientGroup[]
  steps: unknown
}

const DUPLICATE_JUDGE_PROMPT = `You are checking whether a newly submitted recipe on a recipe-sharing app is a duplicate of an already-existing recipe.

"Duplicate" means the same dish, not meaningfully differentiated - e.g. the same recipe reworded, rescaled, or with trivial ingredient substitutions. Two different recipes that happen to be the same general category of dish (e.g. two genuinely different chocolate-chip-cookie recipes with different techniques or ratios) are NOT duplicates - only flag a true near-copy.

Return ONLY JSON matching this shape:
{"isDuplicate": boolean, "matchedRecipeId": string (required and must be one of the candidates' "id" values if isDuplicate is true, omit otherwise), "reason": string explaining your decision}`

@Injectable()
export class RecipeSimilarityService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly gemini: GeminiService,
  ) {}

  async findCandidates(recipe: SimilaritySourceRecipe, excludeId: string): Promise<SimilarityCandidate[]> {
    const others = await this.recipeModel
      .find({
        _id: { $ne: excludeId },
        deletedAt: { $exists: false },
        $or: [{ ownerId: recipe.ownerId }, { publishedRevision: { $ne: null }, hidden: { $ne: true } }],
      })
      .select('title titleHe ingredients steps')
      .lean()
      .exec() as unknown as CandidateDoc[]

    return others
      .filter(other => isDuplicateCandidate(recipe, other))
      .sort((a, b) => this.bestScore(recipe, b) - this.bestScore(recipe, a))
      .slice(0, MAX_CANDIDATES)
      .map(other => ({ id: other._id.toString(), title: other.title, titleHe: other.titleHe, ingredients: other.ingredients, steps: other.steps }))
  }

  async judge(recipe: SimilaritySourceRecipe, candidates: SimilarityCandidate[]): Promise<DuplicateVerdict> {
    const prompt = `${DUPLICATE_JUDGE_PROMPT}

New recipe:
${JSON.stringify({ title: recipe.title, titleHe: recipe.titleHe, ingredients: recipe.ingredients, steps: recipe.steps })}

Candidate existing recipes:
${JSON.stringify(candidates)}`
    // Low temperature, same rationale as RecipeQualityService: a checklist
    // judgment should be reproducible across resubmissions, not creative.
    return this.gemini.generateStructured<DuplicateVerdict>(prompt, 0)
  }

  private bestScore(recipe: SimilaritySourceRecipe, other: CandidateDoc): number {
    return Math.max(
      ingredientQuantityScore(recipe.ingredients, other.ingredients),
      ingredientNameScore(recipe.ingredients, other.ingredients),
      titleSimilarityScore(recipe, other),
    )
  }
}
