// Filters that exist identically on both the published-recipes feed
// (Home.tsx) and My Cookbook (MyRecipesPage.tsx). Persisting them here
// keeps the two in sync - picking a filter on one page and then switching
// to the other shows it already selected, instead of each page resetting
// independently. Category/difficulty/dietary/kosher are all multiselect,
// so each is stored as a comma-joined list rather than a single value.
const CATEGORY_KEY = 'shared-filter-category'
const DIFFICULTY_KEY = 'shared-filter-difficulty'
const DIETARY_KEY = 'shared-filter-dietary'
const KOSHER_KEY = 'shared-filter-kosher'
const SORT_KEY = 'shared-filter-sort'

function getSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(raw.split(',').filter(Boolean)) : new Set()
  } catch {
    return new Set()
  }
}

function setSet(key: string, values: Set<string>): void {
  try {
    if (values.size === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, [...values].join(','))
  } catch { /* storage unavailable */ }
}

export const getSharedCategories = () => getSet(CATEGORY_KEY)
export const setSharedCategories = (values: Set<string>) => setSet(CATEGORY_KEY, values)
export const getSharedDifficulties = () => getSet(DIFFICULTY_KEY)
export const setSharedDifficulties = (values: Set<string>) => setSet(DIFFICULTY_KEY, values)
export const getSharedDietary = () => getSet(DIETARY_KEY)
export const setSharedDietary = (values: Set<string>) => setSet(DIETARY_KEY, values)
export const getSharedKosher = () => getSet(KOSHER_KEY)
export const setSharedKosher = (values: Set<string>) => setSet(KOSHER_KEY, values)

export function getSharedSort(): string | null {
  try { return localStorage.getItem(SORT_KEY) } catch { return null }
}

export function setSharedSort(value: string): void {
  try { localStorage.setItem(SORT_KEY, value) } catch { /* storage unavailable */ }
}
