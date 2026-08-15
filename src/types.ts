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

export type KosherType = 'meat' | 'dairy' | 'parve'

export interface IngredientItem {
  amount: number
  unit: string
  name: string        // Hebrew
  nameEn?: string     // English
  note?: string
  noteEn?: string
  // When set, this ingredient references another recipe instead of a
  // free-text name - see RecipeLinkPicker/LinkedIngredientDisplay. `name`/
  // `nameEn` are cleared client-side whenever this is set.
  linkedRecipeId?: string
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
  image?: string
}

export interface StepGroup {
  title?: string     // Hebrew section title
  titleEn?: string   // English section title
  items: StepItem[]
}

export interface Nutrition {
  calories?: number       // per 100g
  protein?: number        // per 100g
  carbs?: number          // per 100g
  fat?: number            // per 100g
  servingWeight?: number  // estimated grams per serving
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
  kosherType?: KosherType
  nutrition?: Nutrition   // per-100g estimate, usually AI-generated
  ingredients: IngredientGroup[]
  steps: StepGroup[]
  source?: string
  // Set when this recipe was researched/written by the AI-generate feature
  // rather than a human - drives the non-removable "AI generated" badge.
  aiGenerated?: boolean
  // Citations shown in an "extra info" section. Editable for regular
  // recipes, hidden when empty; read-only once aiGenerated is true.
  sources?: { title: string; url: string }[]
  hidden?: boolean
  tips?: string[]        // Hebrew tips
  tipsEn?: string[]      // English tips
  averageRating?: number | null
  ratingCount?: number
  viewCount?: number
  cookCount?: number
  userCookCount?: number
  createdAt?: string
  ownerId?: string
  ownerName?: string | null
  status?: 'draft' | 'pending_review' | 'published' | 'rejected'
  reviewComment?: string
  currentRevision?: number
  publishedRevision?: number | null
  qualityReview?: QualityReview
  duplicateReview?: DuplicateReview
  disputeStatus?: 'none' | 'pending' | 'approved' | 'denied'
  disputeMessage?: string
  pendingReview?: boolean
  batchId?: string
  dishGroupId?: string
  dishGroupName?: string
  dishGroupNameHe?: string
}

export interface QualityFinding {
  category: string
  severity: 'critical' | 'major' | 'minor'
  message: string
  field?: string
}

export interface QualityReview {
  score: number
  checkedAt: string
  findings: QualityFinding[]
  suggestedFields?: Record<string, unknown>
}

export interface DuplicateReview {
  isDuplicate: boolean
  matchedRecipeId: string
  matchedRecipeTitle: string
  reason: string
  checkedAt: string
}

export interface RecipeRevision {
  id: string
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
  /** Epoch ms this timer reaches zero - only meaningful while `running`. Lets remaining time be recomputed from wall-clock time instead of drifting when the tab is backgrounded/suspended. */
  endsAt?: number
}

export type ReportReason = 'inappropriate' | 'incorrect' | 'spam' | 'copyright' | 'other'

export interface Job {
  id: string
  type: 'import' | 'ai_generate'
  status: 'queued' | 'running' | 'done' | 'failed'
  label?: string
  resultRecipeIds: string[]
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}
