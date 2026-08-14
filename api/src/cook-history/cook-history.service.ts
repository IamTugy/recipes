import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { CookSession, CookSessionDocument } from '../cook-sessions/schemas/cook-session.schema'
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'

const HISTORY_PAGE_SIZE = 100
const TRAILING_MONTHS = 12
const MOST_COOKED_LIMIT = 5

export interface CookHistoryStats {
  totalRecipesCooked: number
  totalCooks: number
  totalTimeSpentSeconds: number
  cooksByMonth: { month: string; count: number }[]
  mostCooked: { recipeId: string; recipeTitle: string; count: number }[]
}

export interface CookHistoryEntry {
  recipeId: string
  recipeTitle: string
  finishedAt: string
  totalDurationSeconds: number
}

export interface CookRecipeHistoryView {
  recipeTitle: string
  sessions: {
    finishedAt: string
    totalDurationSeconds: number
    steps: { stepNum: number; durationSeconds: number }[]
  }[]
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

@Injectable()
export class CookHistoryService {
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
  ) {}

  private async resolveTitles(recipeIds: string[]): Promise<Map<string, string>> {
    const validIds = recipeIds.filter(id => Types.ObjectId.isValid(id))
    if (validIds.length === 0) return new Map()
    try {
      const recipes = await this.recipeModel
        .find({ _id: { $in: validIds } })
        .select('title')
        .lean()
        .exec()
      return new Map(recipes.map(r => [String(r._id), r.title]))
    } catch {
      return new Map()
    }
  }

  async getStats(userId: string): Promise<CookHistoryStats> {
    const sessions = await this.cookSessionModel
      .find({ userId })
      .select('recipeId finishedAt totalDurationSeconds')
      .lean()
      .exec()

    const totalCooks = sessions.length
    const totalRecipesCooked = new Set(sessions.map(s => s.recipeId)).size
    const totalTimeSpentSeconds = sessions.reduce((sum, s) => sum + s.totalDurationSeconds, 0)

    const now = new Date()
    const cooksByMonth: { month: string; count: number }[] = []
    for (let i = TRAILING_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      cooksByMonth.push({ month: monthKey(d), count: 0 })
    }
    const monthIndex = new Map(cooksByMonth.map((m, i) => [m.month, i]))
    for (const s of sessions) {
      const idx = monthIndex.get(monthKey(new Date(s.finishedAt)))
      if (idx !== undefined) cooksByMonth[idx].count++
    }

    const countByRecipe = new Map<string, number>()
    for (const s of sessions) countByRecipe.set(s.recipeId, (countByRecipe.get(s.recipeId) ?? 0) + 1)
    const topRecipeIds = [...countByRecipe.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST_COOKED_LIMIT)
    const titleById = await this.resolveTitles(topRecipeIds.map(([id]) => id))
    const mostCooked = topRecipeIds
      .map(([recipeId, count]) => {
        const recipeTitle = titleById.get(recipeId)
        return recipeTitle ? { recipeId, recipeTitle, count } : null
      })
      .filter((r): r is { recipeId: string; recipeTitle: string; count: number } => r !== null)

    return { totalRecipesCooked, totalCooks, totalTimeSpentSeconds, cooksByMonth, mostCooked }
  }

  async getHistory(userId: string): Promise<CookHistoryEntry[]> {
    const sessions = await this.cookSessionModel
      .find({ userId })
      .select('recipeId finishedAt totalDurationSeconds')
      .sort({ finishedAt: -1 })
      .limit(HISTORY_PAGE_SIZE)
      .lean()
      .exec()
    if (sessions.length === 0) return []

    const recipeIds = [...new Set(sessions.map(s => s.recipeId))]
    const titleById = await this.resolveTitles(recipeIds)

    return sessions
      .map(s => {
        const recipeTitle = titleById.get(s.recipeId)
        if (!recipeTitle) return null
        return {
          recipeId: s.recipeId,
          recipeTitle,
          finishedAt: s.finishedAt.toISOString(),
          totalDurationSeconds: s.totalDurationSeconds,
        }
      })
      .filter((e): e is CookHistoryEntry => e !== null)
  }

  async getRecipeHistory(userId: string, recipeId: string): Promise<CookRecipeHistoryView | null> {
    let recipe: { title: string } | null = null
    try {
      recipe = await this.recipeModel.findOne({ _id: recipeId }).select('title').lean().exec()
    } catch {
      return null
    }
    if (!recipe) return null

    const sessions = await this.cookSessionModel
      .find({ userId, recipeId })
      .select('finishedAt totalDurationSeconds steps')
      .sort({ finishedAt: -1 })
      .lean()
      .exec()

    return {
      recipeTitle: recipe.title,
      sessions: sessions.map(s => ({
        finishedAt: s.finishedAt.toISOString(),
        totalDurationSeconds: s.totalDurationSeconds,
        steps: s.steps.map(step => ({ stepNum: step.stepNum, durationSeconds: step.durationSeconds })),
      })),
    }
  }
}
