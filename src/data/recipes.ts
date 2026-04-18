import type { Recipe } from '../types'

const modules = import.meta.glob('./recipes/*.yaml', { eager: true }) as Record<string, Recipe>

export const recipes: Recipe[] = Object.values(modules).sort((a, b) =>
  (a.id ?? '').localeCompare(b.id ?? '')
)

export function getRecipe(id: string): Recipe | undefined {
  return recipes.find(r => r.id === id)
}
