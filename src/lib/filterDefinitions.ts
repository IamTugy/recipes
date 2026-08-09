// Single source of truth for the "advanced filters" on Home: difficulty,
// dietary tags, and kosher classification. Home.tsx renders these as chips
// with a tap-to-open tooltip using the text below. The backend AI prompts
// (recipe-ai-generate, recipe-import) describe the same kosher semantics
// inline in their own prompt strings, since api/ and src/ are separate TS
// projects with no shared module boundary - keep them in sync by hand if
// this file's kosher wording changes.
export type FilterKind = 'difficulty' | 'dietary' | 'kosher'

export interface FilterDef {
  key: string
  kind: FilterKind
  label: { he: string; en: string }
  tooltip: { he: string; en: string }
}

export const DIFFICULTY_FILTERS: FilterDef[] = [
  {
    key: 'easy', kind: 'difficulty',
    label: { he: 'קל', en: 'Easy' },
    tooltip: { he: 'מתכונים פשוטים עם מעט שלבים, מתאים למתחילים.', en: 'Simple recipes with few steps, beginner-friendly.' },
  },
  {
    key: 'medium', kind: 'difficulty',
    label: { he: 'בינוני', en: 'Medium' },
    tooltip: { he: 'דורש קצת ניסיון במטבח או כמה שלבים נוספים.', en: 'Needs some kitchen experience or a few extra steps.' },
  },
  {
    key: 'hard', kind: 'difficulty',
    label: { he: 'מאתגר', en: 'Hard' },
    tooltip: { he: 'טכניקות מורכבות או תהליך הכנה ארוך.', en: 'Complex techniques or a long, involved process.' },
  },
]

export const DIETARY_FILTERS: FilterDef[] = [
  {
    key: 'vegetarian', kind: 'dietary',
    label: { he: 'צמחוני', en: 'Vegetarian' },
    tooltip: { he: 'ללא בשר, עוף או דגים.', en: 'No meat, poultry, or fish.' },
  },
  {
    key: 'vegan', kind: 'dietary',
    label: { he: 'טבעוני', en: 'Vegan' },
    tooltip: { he: 'ללא מוצרים מן החי בכלל - גם לא ביצים או מוצרי חלב.', en: 'No animal products at all - no eggs or dairy either.' },
  },
  {
    key: 'gluten-free', kind: 'dietary',
    label: { he: 'ללא גלוטן', en: 'Gluten-free' },
    tooltip: { he: 'ללא חיטה, שעורה או מרכיבים אחרים המכילים גלוטן.', en: 'No wheat, barley, or other gluten-containing ingredients.' },
  },
  {
    key: 'dairy-free', kind: 'dietary',
    label: { he: 'ללא חלב', en: 'Dairy-free' },
    tooltip: { he: 'ללא חלב או מוצרי חלב - מתאים לרגישות/אי-סבילות למוצרי חלב.', en: 'No milk or dairy products - for a dairy allergy/intolerance, not a kosher classification.' },
  },
]

// Distinct from dairy-free above: this is a kosher-style classification of
// the whole dish, not an allergy/health filter. "Dairy" here means the
// recipe contains dairy AND no meat, poultry, or fish of any kind. "Meat"
// means it contains any meat, poultry, or fish. ("Parve" - neither - is
// tracked as data on the recipe but isn't exposed as a filter chip.)
export const KOSHER_FILTERS: FilterDef[] = [
  {
    key: 'meat', kind: 'kosher',
    label: { he: 'בשרי', en: 'Meat' },
    tooltip: { he: 'מכיל בשר, עוף או דגים מכל סוג.', en: 'Contains any meat, poultry, or fish.' },
  },
  {
    key: 'dairy', kind: 'kosher',
    label: { he: 'חלבי', en: 'Dairy' },
    tooltip: { he: 'מכיל מוצרי חלב וללא בשר, עוף או דגים מכל סוג.', en: 'Contains dairy and no meat, poultry, or fish of any kind.' },
  },
]

export const ALL_FILTERS: FilterDef[] = [...DIFFICULTY_FILTERS, ...DIETARY_FILTERS, ...KOSHER_FILTERS]
