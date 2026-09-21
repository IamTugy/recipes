export type CookTogetherStatus = 'lobby' | 'cooking' | 'finished'
export type CookTogetherTaskStatus = 'pending' | 'in_progress' | 'done'

export interface CookTogetherParticipant {
  userId: string
  name?: string
  imageUrl?: string
  joinedAt: string
}

// One task per recipe step. `id` is the same "<groupIdx>-<stepIdx>" key the
// solo cook dock uses for a step, so the two features agree on step identity.
export interface CookTogetherTask {
  id: string
  stepNum: number
  instruction: string
  instructionEn?: string
  // Hands-on time: the assignee can't do anything else meanwhile.
  activeMinutes: number
  // Passive time after the hands-on part (oven, resting, simmering) - the
  // assignee is free to take another task, but dependents still have to wait.
  waitMinutes: number
  // Ids of tasks that must be done first. Always reference lower stepNums.
  dependsOn: string[]
  assigneeId: string | null
  status: CookTogetherTaskStatus
  startedAt?: string
  completedAt?: string
  completedBy?: string
}

export interface CookTogetherRoom {
  code: string
  recipeId: string
  recipeTitle: string
  recipeTitleHe?: string
  hostId: string
  status: CookTogetherStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  participants: CookTogetherParticipant[]
  tasks: CookTogetherTask[]
  planSource: 'ai' | 'fallback' | null
}

export interface ParticipantProgress {
  userId: string
  doneTasks: number
  totalTasks: number
  remainingMinutes: number
  currentTaskIds: string[]
}

export interface CookTogetherProgress {
  totalTasks: number
  doneTasks: number
  percent: number
  remainingMinutes: number
  etaAt: string | null
  // actual/estimated hands-on time of finished tasks, clamped - >1 means
  // the group is slower than the plan assumed.
  speedFactor: number
  perParticipant: ParticipantProgress[]
  // When each unfinished task is expected to be done, per the same
  // simulation that produces etaAt.
  taskEtaAt: Record<string, string>
}

export interface CookTogetherView extends Omit<CookTogetherRoom, 'tasks'> {
  tasks: (CookTogetherTask & { estimatedMinutes: number })[]
  progress: CookTogetherProgress
  viewerId: string
}
