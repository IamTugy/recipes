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
  name: string
  note?: string
}

export interface IngredientGroup {
  group?: string
  items: IngredientItem[]
}

export interface StepItem {
  instruction: string
  timerMinutes?: number
  tip?: string
}

export interface StepGroup {
  title?: string
  items: StepItem[]
}

export interface Recipe {
  id: string
  title: string
  titleHe?: string
  category: Category
  tags: string[]
  cuisine?: string
  image: string
  description: string
  prepTime: number   // minutes
  cookTime: number   // minutes
  servings: number
  difficulty: Difficulty
  ingredients: IngredientGroup[]
  steps: StepGroup[]
  source?: string
  featured?: boolean
  tips?: string[]
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
