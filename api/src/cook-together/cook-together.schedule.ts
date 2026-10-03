import {
  CookTogetherProgress, CookTogetherRoom, CookTogetherTask, ParticipantProgress,
} from './cook-together.types'

const MS_PER_MINUTE = 60_000
const MIN_SPEED_FACTOR = 0.5
const MAX_SPEED_FACTOR = 2
// Pseudo-observation blended into the speed estimate so one unusually fast or
// slow first task doesn't swing the whole ETA: it counts as "5 estimated
// minutes that took exactly 5 minutes".
const SPEED_PRIOR_MINUTES = 5
// A task that has run past its estimate is assumed to be about a minute from
// done - there's no better signal, and 0 would make the ETA collapse early.
const OVERRUN_REMAINING_MINUTES = 1

export function taskEstimate(task: Pick<CookTogetherTask, 'activeMinutes' | 'waitMinutes'>): number {
  return task.activeMinutes + task.waitMinutes
}

// How fast this group is actually working relative to the plan, measured on
// finished tasks with no passive wait (a task that includes an oven timer says
// nothing about how fast people work). 1 = on plan, 1.5 = 50% slower.
export function speedFactor(tasks: CookTogetherTask[]): number {
  let estimated = 0
  let actual = 0
  for (const task of tasks) {
    if (task.status !== 'done' || task.waitMinutes > 0 || !task.startedAt || !task.completedAt) continue
    const minutes = (new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / MS_PER_MINUTE
    if (!Number.isFinite(minutes) || minutes < 0) continue
    estimated += task.activeMinutes
    actual += minutes
  }
  if (estimated === 0) return 1
  const factor = (actual + SPEED_PRIOR_MINUTES) / (estimated + SPEED_PRIOR_MINUTES)
  return Math.min(MAX_SPEED_FACTOR, Math.max(MIN_SPEED_FACTOR, factor))
}

interface SimulationResult {
  // Minutes from now until each not-yet-done task is finished (done tasks: 0).
  finish: Map<string, number>
  // Minutes from now until each participant has no more hands-on work queued.
  free: Map<string, number>
  // Assignee the simulation used for every pending task.
  assignments: Map<string, string>
}

// Forward-simulates the rest of the cook. Pending tasks are walked in step
// order (dependencies always point to lower steps, so this is a valid
// topological order); each goes to its assignee, or - if it has none, or
// `reassignPending` is set - to whoever could start it soonest, breaking ties
// by lighter workload. This one routine backs both the initial split and the
// live ETA so the plan and the estimate can never disagree about how work flows.
export function simulate(
  tasks: CookTogetherTask[],
  participantIds: string[],
  nowMs: number,
  factor: number,
  reassignPending: boolean,
): SimulationResult {
  const free = new Map(participantIds.map(id => [id, 0]))
  const load = new Map(participantIds.map(id => [id, 0]))
  const finish = new Map<string, number>()
  const assignments = new Map<string, string>()

  for (const task of tasks) {
    if (task.status === 'done') finish.set(task.id, 0)
  }

  for (const task of tasks) {
    if (task.status !== 'in_progress') continue
    const active = task.activeMinutes * factor
    const elapsed = task.startedAt ? Math.max(0, (nowMs - new Date(task.startedAt).getTime()) / MS_PER_MINUTE) : 0
    const handsRemaining = active - elapsed
    let handsFree: number
    let done: number
    if (handsRemaining > 0) {
      handsFree = handsRemaining
      done = handsRemaining + task.waitMinutes
    } else if (task.waitMinutes > 0 && elapsed < active + task.waitMinutes) {
      handsFree = 0
      done = active + task.waitMinutes - elapsed
    } else {
      handsFree = OVERRUN_REMAINING_MINUTES
      done = OVERRUN_REMAINING_MINUTES
    }
    finish.set(task.id, done)
    if (task.assigneeId && free.has(task.assigneeId)) {
      free.set(task.assigneeId, Math.max(free.get(task.assigneeId)!, handsFree))
      load.set(task.assigneeId, load.get(task.assigneeId)! + task.activeMinutes)
    }
  }

  const pending = tasks.filter(t => t.status === 'pending').sort((a, b) => a.stepNum - b.stepNum)
  for (const task of pending) {
    const ready = Math.max(0, ...task.dependsOn.map(dep => finish.get(dep) ?? 0))
    let assignee = task.assigneeId
    if (reassignPending || !assignee || !free.has(assignee)) {
      assignee = null
      let bestStart = Infinity
      let bestLoad = Infinity
      for (const id of participantIds) {
        const start = Math.max(free.get(id)!, ready)
        const personLoad = load.get(id)!
        if (start < bestStart || (start === bestStart && personLoad < bestLoad)) {
          assignee = id
          bestStart = start
          bestLoad = personLoad
        }
      }
    }
    if (!assignee) {
      finish.set(task.id, ready + (task.activeMinutes + task.waitMinutes) * factor)
      continue
    }
    const start = Math.max(free.get(assignee)!, ready)
    const handsEnd = start + task.activeMinutes * factor
    finish.set(task.id, handsEnd + task.waitMinutes)
    free.set(assignee, handsEnd)
    load.set(assignee, load.get(assignee)! + task.activeMinutes)
    assignments.set(task.id, assignee)
  }

  return { finish, free, assignments }
}

// Assigns pending tasks among the given participants - all of them, or (with
// reassignAll=false) only those that don't have an assignee yet. Finished and
// in-progress tasks are left where they are - they only count as existing load.
export function assignPending(
  tasks: CookTogetherTask[],
  participantIds: string[],
  nowMs: number,
  reassignAll = true,
): void {
  if (participantIds.length === 0) {
    for (const task of tasks) if (task.status === 'pending') task.assigneeId = null
    return
  }
  const { assignments } = simulate(tasks, participantIds, nowMs, 1, reassignAll)
  for (const task of tasks) {
    if (task.status !== 'pending') continue
    task.assigneeId = assignments.get(task.id) ?? null
  }
}

export function computeProgress(room: CookTogetherRoom, nowMs: number): CookTogetherProgress {
  const { tasks } = room
  const participantIds = room.participants.map(p => p.userId)
  const factor = speedFactor(tasks)
  const { finish, free } = simulate(tasks, participantIds, nowMs, factor, false)

  let totalWeight = 0
  let doneWeight = 0
  for (const task of tasks) {
    const weight = taskEstimate(task)
    totalWeight += weight
    if (task.status === 'done') {
      doneWeight += weight
    } else if (task.status === 'in_progress' && task.startedAt && weight > 0) {
      const elapsed = (nowMs - new Date(task.startedAt).getTime()) / MS_PER_MINUTE
      doneWeight += weight * Math.min(0.9, Math.max(0, elapsed / weight))
    }
  }

  const doneTasks = tasks.filter(t => t.status === 'done').length
  const unfinished = tasks.filter(t => t.status !== 'done')
  const remainingMinutes = unfinished.length === 0
    ? 0
    : Math.ceil(Math.max(...unfinished.map(t => finish.get(t.id) ?? 0)))

  const taskEtaAt: Record<string, string> = {}
  for (const task of unfinished) {
    taskEtaAt[task.id] = new Date(nowMs + (finish.get(task.id) ?? 0) * MS_PER_MINUTE).toISOString()
  }

  const perParticipant: ParticipantProgress[] = room.participants.map(p => {
    const mine = tasks.filter(t => t.assigneeId === p.userId)
    return {
      userId: p.userId,
      doneTasks: mine.filter(t => t.status === 'done').length,
      totalTasks: mine.length,
      remainingMinutes: Math.ceil(free.get(p.userId) ?? 0),
      currentTaskIds: mine.filter(t => t.status === 'in_progress').map(t => t.id),
    }
  })

  return {
    totalTasks: tasks.length,
    doneTasks,
    percent: totalWeight === 0 ? 0 : Math.round((doneWeight / totalWeight) * 100),
    remainingMinutes,
    etaAt: room.status === 'cooking' && unfinished.length > 0
      ? new Date(nowMs + remainingMinutes * MS_PER_MINUTE).toISOString()
      : null,
    speedFactor: Math.round(factor * 100) / 100,
    perParticipant,
    taskEtaAt,
  }
}
