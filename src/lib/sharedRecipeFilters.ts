// Category/difficulty are the two filters that exist identically on both
// the published-recipes feed (Home.tsx) and My Cookbook (MyRecipesPage.tsx).
// Persisting them here keeps the two in sync - picking "Dessert" on one
// page and then switching to the other shows it already selected, instead
// of each page resetting independently.
const CATEGORY_KEY = 'shared-filter-category'
const DIFFICULTY_KEY = 'shared-filter-difficulty'

export function getSharedCategory(): string | null {
  try { return localStorage.getItem(CATEGORY_KEY) } catch { return null }
}

export function setSharedCategory(value: string | null): void {
  try {
    if (value) localStorage.setItem(CATEGORY_KEY, value)
    else localStorage.removeItem(CATEGORY_KEY)
  } catch { /* storage unavailable */ }
}

export function getSharedDifficulty(): string | null {
  try { return localStorage.getItem(DIFFICULTY_KEY) } catch { return null }
}

export function setSharedDifficulty(value: string | null): void {
  try {
    if (value) localStorage.setItem(DIFFICULTY_KEY, value)
    else localStorage.removeItem(DIFFICULTY_KEY)
  } catch { /* storage unavailable */ }
}
