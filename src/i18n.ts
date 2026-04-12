import type { Category, Difficulty } from './types'

// singular / plural pairs for Hebrew units
const heUnitForms: Record<string, [string, string]> = {
  g:      ['גרם',    'גרם'],
  kg:     ['ק"ג',   'ק"ג'],
  cup:    ['כוס',   'כוסות'],
  cups:   ['כוס',   'כוסות'],
  tbsp:   ['כף',    'כפות'],
  tsp:    ['כפית',  'כפיות'],
  ml:     ['מ"ל',   'מ"ל'],
  l:      ['ליטר',  'ליטר'],
  liter:  ['ליטר',  'ליטר'],
  liters: ['ליטר',  'ליטר'],
  cm:     ['ס"מ',   'ס"מ'],
  mm:     ['מ"מ',   'מ"מ'],
  pcs:    ["יח'",   "יח'"],
  pc:     ["יח'",   "יח'"],
  cloves: ['שן',    'שיניים'],
  bunch:  ['צרור',  'צרורות'],
  sprigs: ['ענף',   'ענפים'],
}

export function heUnit(unit: string, amount: number): string {
  const forms = heUnitForms[unit]
  if (!forms) return unit
  return amount === 1 ? forms[0] : forms[1]
}

// Keep for backward compat
export const heUnits: Record<string, string> = Object.fromEntries(
  Object.entries(heUnitForms).map(([k, [, plural]]) => [k, plural])
)

export const t = {
  he: {
    siteTitle: "המטבח של טוגי",
    heroLine1: 'לא המתכונים שלי. המטבח שלי.',
    heroLine2: 'ארכיון אישי של בישול ים-תיכוני וישראלי - נבדק, נאהב, ומשותף.',
    searchPlaceholder: "חפשו מתכון...",
    searchResultsCount: (n: number) => `נמצאו ${n} מתכון${n !== 1 ? 'ות' : ''}`,
    noResultsTitle: "לא נמצאו מתכונים",
    noResultsHint: "נסו חיפוש אחר או קטגוריה שונה",
    featured: "מובחרים",
    all: "הכל",
    back: "חזרה",
    notFound: "המתכון לא נמצא",
    backToRecipes: "חזרה למתכונים",
    prep: "הכנה",
    cook: "בישול",
    total: "סה\"כ",
    servings: "מנות",
    portions: "מנות:",
    customPortions: "מותאם",
    ingredients: "מצרכים",
    instructions: "אופן הכנה",
    tipsTitle: "טיפים והערות",
    timerRunning: "טיימר פועל - ראו פאנל למטה",
    startTimer: (m: number) => `הפעל טיימר ${m} דקות`,
    difficulty: { easy: 'קל', medium: 'בינוני', hard: 'מאתגר' } as Record<Difficulty, string>,
    categories: {
      all: 'הכל',
      breakfast: 'ארוחת בוקר',
      lunch: 'ארוחת צהריים',
      dinner: 'ארוחת ערב',
      dessert: 'קינוח',
      salad: 'סלט',
      soup: 'מרק',
      snack: 'נשנוש',
      bread: 'לחם ומאפים',
      sauce: 'רטבים',
    } as Record<string, string>,
  },
  en: {
    siteTitle: "Tugy's Cookbook",
    heroLine1: 'Not my recipes. My kitchen.',
    heroLine2: 'A personal archive of Mediterranean and Israeli cooking - tested, loved, and shared.',
    searchPlaceholder: "Search recipes...",
    searchResultsCount: (n: number) => `${n} recipe${n !== 1 ? 's' : ''} found`,
    noResultsTitle: "No recipes found",
    noResultsHint: "Try a different search or category",
    featured: "Featured",
    all: "All",
    back: "Back",
    notFound: "Recipe not found",
    backToRecipes: "Back to recipes",
    prep: "Prep",
    cook: "Cook",
    total: "Total",
    servings: "Servings",
    portions: "Portions:",
    customPortions: "Custom",
    ingredients: "Ingredients",
    instructions: "Instructions",
    tipsTitle: "Tips & Notes",
    timerRunning: "Timer running - see panel below",
    startTimer: (m: number) => `Start ${m}m timer`,
    difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as Record<Difficulty, string>,
    categories: {
      all: 'All',
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      dessert: 'Dessert',
      salad: 'Salad',
      soup: 'Soup',
      snack: 'Snack',
      bread: 'Bread & Bakes',
      sauce: 'Sauces',
    } as Record<string, string>,
  },
}

export const categoryEmoji: Record<Category, string> = {
  breakfast: '🍳',
  lunch: '🥗',
  dinner: '🍲',
  dessert: '🍰',
  salad: '🥙',
  soup: '🍜',
  snack: '🧆',
  bread: '🍞',
  sauce: '🫙',
}
