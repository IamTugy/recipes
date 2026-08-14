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

export interface CookRecipeHistorySession {
  finishedAt: string
  totalDurationSeconds: number
  steps: { stepNum: number; durationSeconds: number }[]
}

export interface CookRecipeHistory {
  recipeTitle: string
  sessions: CookRecipeHistorySession[]
}

export function fetchCookRecipeHistory(
  recipeId: string,
  getToken: () => Promise<string | null>
): Promise<CookRecipeHistory> {
  return apiFetch<CookRecipeHistory>(`/cook-history/${recipeId}`, getToken)
}
