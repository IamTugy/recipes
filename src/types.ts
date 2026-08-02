export type Lang = 'he' | 'en'

export type Category =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'dessert'
  | 'salad'
  | 'soup'
  | 'snack'
  | 'bread'
  | 'sauce'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface IngredientItem {
  amount: number
  unit: string
  name: string        // Hebrew
  nameEn?: string     // English
  note?: string
  noteEn?: string
}

export interface IngredientGroup {
  group?: string      // Hebrew group label
  groupEn?: string    // English group label
  items: IngredientItem[]
}

export interface StepItem {
  instruction: string      // Hebrew
  instructionEn?: string   // English
  timerMinutes?: number
  tip?: string             // Hebrew
  tipEn?: string           // English
}

export interface StepGroup {
  title?: string     // Hebrew section title
  titleEn?: string   // English section title
  items: StepItem[]
}

export interface Recipe {
  id: string
  title: string          // English title
  titleHe?: string       // Hebrew title
  category: Category
  tags: string[]         // Hebrew tags
  tagsEn?: string[]      // English tags
  cuisine?: string
  image: string
  description: string    // Hebrew description
  descriptionEn?: string // English description
  prepTime: number       // minutes
  cookTime: number       // minutes
  servings: number
  difficulty: Difficulty
  ingredients: IngredientGroup[]
  steps: StepGroup[]
  source?: string
  featured?: boolean
  hidden?: boolean
  tips?: string[]        // Hebrew tips
  tipsEn?: string[]      // English tips
  averageRating?: number | null
  ratingCount?: number
  viewCount?: number
  cookCount?: number
  createdAt?: string
  ownerId?: string
  ownerName?: string | null
  status?: 'draft' | 'pending_review' | 'published' | 'rejected'
  reviewComment?: string
  currentRevision?: number
  publishedRevision?: number | null
}

export interface RecipeRevision {
  revisionNumber: number
  authorId: string
  snapshot: Record<string, unknown>
  published: boolean
  publishedAt: string
}

export interface TimerState {
  id: string
  label: string
  totalSeconds: number
  remainingSeconds: number
  running: boolean
  done: boolean
  recipeId: string
  stepIndex: number
}
