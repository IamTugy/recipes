import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { DishGroup, DishGroupDocument } from '../schemas/dish-group.schema'
import { GeminiService } from '../../ai/gemini.service'

export interface GroupableRecipe {
  title?: string
  titleHe?: string
  ingredients?: unknown
}

export interface AssignedGroup {
  id: string
  name: string
  nameHe?: string
}

interface GroupAssignmentVerdict {
  existingGroupId?: string
  name?: string
  nameHe?: string
}

interface ExistingGroupDoc {
  _id: { toString(): string }
  name: string
  nameHe?: string
}

const GROUP_ASSIGNMENT_PROMPT = `You are assigning a newly published recipe on a recipe-sharing app to a "dish group" - a specific, canonical name for the dish it is, used to group recipes together for browsing.

The name must be SPECIFIC, never a broad category. "Salad", "Cookies", or "Soup" are too broad and must never be used as a group name. "Caprese Salad" or "Chocolate Chip Cookies" are correctly specific.

You are given the recipe's title/ingredients, and a list of existing dish groups (each with an "id" and "name"). If this recipe is genuinely the same specific dish as one of the existing groups (not just the same broad category), return that group's exact "id" as "existingGroupId". Otherwise, propose a new specific dish name for it.

Return ONLY JSON matching this shape:
{"existingGroupId": string (omit entirely if none of the existing groups match), "name": string (the new specific dish name in English - required unless existingGroupId is set), "nameHe": string (optional - the new specific dish name in Hebrew)}`

@Injectable()
export class RecipeGroupingService {
  constructor(
    @InjectModel(DishGroup.name) private readonly dishGroupModel: Model<DishGroupDocument>,
    private readonly gemini: GeminiService,
  ) {}

  async assignGroup(recipe: GroupableRecipe): Promise<AssignedGroup> {
    const existingGroups = await this.dishGroupModel.find().select('name nameHe').lean().exec() as unknown as ExistingGroupDoc[]

    const prompt = `${GROUP_ASSIGNMENT_PROMPT}

Recipe:
${JSON.stringify({ title: recipe.title, titleHe: recipe.titleHe, ingredients: recipe.ingredients })}

Existing dish groups:
${JSON.stringify(existingGroups.map(g => ({ id: g._id.toString(), name: g.name, nameHe: g.nameHe })))}`

    // Low temperature, same rationale as the quality review and duplicate
    // judge: a checklist-style assignment should be reproducible, not creative.
    const verdict = await this.gemini.generateStructured<GroupAssignmentVerdict>(prompt, 0)

    if (verdict.existingGroupId) {
      const matched = existingGroups.find(g => g._id.toString() === verdict.existingGroupId)
      if (matched) {
        return { id: matched._id.toString(), name: matched.name, nameHe: matched.nameHe }
      }
    }

    // Gemini hallucinated an id outside the list, or proposed no match at
    // all - either way, start a new group rather than leaving the recipe
    // silently ungrouped. Fall back to the recipe's own title if it also
    // failed to propose a name.
    const name = verdict.name?.trim() || recipe.title?.trim() || 'Untitled dish'
    const nameHe = verdict.nameHe?.trim() || undefined
    const created = await this.dishGroupModel.create({ name, nameHe })
    return { id: created._id.toString(), name: created.name, nameHe: created.nameHe }
  }
}
