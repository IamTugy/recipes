import { assignPending } from './cook-together.schedule'
import { CookTogetherTask } from './cook-together.types'

export interface PlanStepGroup {
  items: { instruction?: string; instructionEn?: string; timerMinutes?: number }[]
}

// Shape the AI is asked to return - `step` is the 1-based step number,
// `assignee` a 0-based index into the participant list.
export interface AiPlanStep {
  step: number
  assignee: number
  activeMinutes: number
  waitMinutes: number
  dependsOn: number[]
}

export interface AiPlanResponse {
  steps: AiPlanStep[]
}

const MAX_ACTIVE_MINUTES = 180
const MAX_WAIT_MINUTES = 720

// Rough hands-on time when the AI is unavailable: longer instructions usually
// mean more work. A recipe-author timer on the step is the passive wait.
export function fallbackEstimate(instruction: string, timerMinutes?: number): { activeMinutes: number; waitMinutes: number } {
  const words = instruction.trim().split(/\s+/).filter(Boolean).length
  const activeMinutes = Math.min(15, Math.max(2, Math.round(words / 8)))
  return { activeMinutes, waitMinutes: timerMinutes && timerMinutes > 0 ? Math.round(timerMinutes) : 0 }
}

// One task per step. Fallback dependencies follow how recipes are usually
// structured: steps inside a group (dough, sauce, ...) run in order, groups
// are independent components, and the last group is the assembly that needs
// all the others first.
export function buildTasks(groups: PlanStepGroup[]): CookTogetherTask[] {
  const tasks: CookTogetherTask[] = []
  const lastOfGroup: (string | null)[] = []
  let stepNum = 0
  groups.forEach((group, gi) => {
    let previous: string | null = null
    group.items.forEach((step, si) => {
      stepNum += 1
      const id = `${gi}-${si}`
      const instruction = step.instruction ?? step.instructionEn ?? ''
      const dependsOn: string[] = []
      if (previous) dependsOn.push(previous)
      else if (gi > 0 && gi === groups.length - 1) {
        dependsOn.push(...(lastOfGroup.filter(Boolean) as string[]))
      }
      tasks.push({
        id,
        stepNum,
        instruction,
        instructionEn: step.instructionEn,
        ...fallbackEstimate(instruction, step.timerMinutes),
        dependsOn,
        assigneeId: null,
        status: 'pending',
      })
      previous = id
    })
    lastOfGroup.push(previous)
  })
  return tasks
}

export function buildPlanPrompt(recipeTitle: string, tasks: CookTogetherTask[], participantCount: number, timers: Map<string, number>): string {
  const stepLines = tasks
    .map(t => {
      const timer = timers.get(t.id)
      return `${t.stepNum}. ${t.instructionEn ?? t.instruction}${timer ? ` [recipe timer: ${timer} min]` : ''}`
    })
    .join('\n')
  return `You are a kitchen coordinator. ${participantCount} people are cooking "${recipeTitle}" together and you split the work between them so the dish is finished as early as possible and everyone stays busy.

Steps:
${stepLines}

For EVERY step, decide:
- "assignee": the 0-based index (0 to ${participantCount - 1}) of the person who should do it. Spread the hands-on work evenly and keep related consecutive steps with the same person when that avoids hand-offs. Everyone should get some work when there are at least as many steps as people.
- "activeMinutes": realistic minutes of hands-on work for an average home cook (integer, at least 1).
- "waitMinutes": passive minutes after the hands-on work during which nobody has to attend to it, such as baking, simmering, resting or chilling (integer, 0 if none). Use the recipe timer when one is given.
- "dependsOn": step numbers that must be completely finished before this step can start (only lower step numbers, only real dependencies - steps that can run in parallel must NOT depend on each other).

Respond with ONLY a JSON object of this exact shape, with one entry per step:
{"steps": [{"step": 1, "assignee": 0, "activeMinutes": 5, "waitMinutes": 0, "dependsOn": []}]}`
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, Math.round(value)))
}

// Merges an AI plan into freshly built tasks, never trusting it blindly:
// numbers are clamped, dependencies may only point at lower existing steps
// (which also rules out cycles), the recipe author's timer is kept as a floor
// for the wait, and an assignment that leaves someone with nothing to do
// while there are enough steps to go around is discarded for the greedy
// split. Returns whether the AI's answer was usable at all.
export function applyAiPlan(
  tasks: CookTogetherTask[],
  ai: AiPlanResponse | null | undefined,
  participantIds: string[],
  timers: Map<string, number>,
  nowMs: number,
): boolean {
  const byStep = new Map<number, AiPlanStep>()
  for (const entry of Array.isArray(ai?.steps) ? ai!.steps : []) {
    if (entry && Number.isInteger(entry.step)) byStep.set(entry.step, entry)
  }
  const covered = tasks.filter(t => byStep.has(t.stepNum)).length
  if (tasks.length === 0 || covered < Math.ceil(tasks.length / 2)) {
    assignPending(tasks, participantIds, nowMs)
    return false
  }

  const validSteps = new Set(tasks.map(t => t.stepNum))
  const idByStep = new Map(tasks.map(t => [t.stepNum, t.id]))
  for (const task of tasks) {
    const entry = byStep.get(task.stepNum)
    if (!entry) continue
    const active = clampInt(entry.activeMinutes, 1, MAX_ACTIVE_MINUTES)
    const wait = clampInt(entry.waitMinutes ?? 0, 0, MAX_WAIT_MINUTES)
    if (active !== null) task.activeMinutes = active
    if (wait !== null) task.waitMinutes = wait
    const timer = timers.get(task.id)
    if (timer && task.waitMinutes < timer) task.waitMinutes = timer
    task.dependsOn = [...new Set(
      (Array.isArray(entry.dependsOn) ? entry.dependsOn : [])
        .filter(dep => Number.isInteger(dep) && dep < task.stepNum && validSteps.has(dep))
        .map(dep => idByStep.get(dep)!),
    )]
    const index = Number.isInteger(entry.assignee) ? entry.assignee : -1
    task.assigneeId = participantIds[index] ?? null
  }

  const everyoneBusy = participantIds.every(id => tasks.some(t => t.assigneeId === id))
  if (!everyoneBusy && tasks.length >= participantIds.length) {
    assignPending(tasks, participantIds, nowMs)
  } else {
    // Steps the AI skipped (or gave an out-of-range assignee) get the greedy pick.
    assignPending(tasks, participantIds, nowMs, false)
  }
  return true
}
