import { apiFetch } from './api'

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

export function fetchCookHistoryStats(getToken: () => Promise<string | null>): Promise<CookHistoryStats> {
  return apiFetch<CookHistoryStats>('/cook-history/stats', getToken)
}

export function fetchCookHistory(getToken: () => Promise<string | null>): Promise<CookHistoryEntry[]> {
  return apiFetch<CookHistoryEntry[]>('/cook-history', getToken)
}
