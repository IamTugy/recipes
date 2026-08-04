import type { IngredientGroup, Nutrition } from '../types'

export async function estimateNutrition(
  ingredients: IngredientGroup[],
  servings: number | undefined,
  getToken: () => Promise<string | null>
): Promise<Nutrition | null> {
  try {
    const token = await getToken()
    const res = await fetch('/api/recipes/nutrition/estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ingredients, servings }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
