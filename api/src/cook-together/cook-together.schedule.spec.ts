import { assignPending, computeProgress, simulate, speedFactor } from './cook-together.schedule'
import { CookTogetherRoom, CookTogetherTask } from './cook-together.types'

const NOW = new Date('2026-09-21T12:00:00.000Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60000).toISOString()

function task(over: Partial<CookTogetherTask> & { id: string; stepNum: number }): CookTogetherTask {
  return {
    instruction: 'do it', activeMinutes: 10, waitMinutes: 0, dependsOn: [],
    assigneeId: null, status: 'pending', ...over,
  }
}

function room(tasks: CookTogetherTask[], ids = ['a', 'b']): CookTogetherRoom {
  return {
    code: 'ABC234', recipeId: 'r1', recipeTitle: 'Soup', hostId: ids[0], status: 'cooking',
    createdAt: minutesAgo(30), startedAt: minutesAgo(30), planSource: 'ai', tasks,
    participants: ids.map(userId => ({ userId, joinedAt: minutesAgo(30) })),
  }
}

describe('assignPending', () => {
  it('spreads independent tasks across participants', () => {
    const tasks = [1, 2, 3, 4].map(n => task({ id: `t${n}`, stepNum: n }))
    assignPending(tasks, ['a', 'b'], NOW)
    expect(tasks.filter(t => t.assigneeId === 'a')).toHaveLength(2)
    expect(tasks.filter(t => t.assigneeId === 'b')).toHaveLength(2)
  })

  it('does not touch done or in-progress tasks', () => {
    const tasks = [
      task({ id: 't1', stepNum: 1, status: 'done', assigneeId: 'a' }),
      task({ id: 't2', stepNum: 2, status: 'in_progress', assigneeId: 'a', startedAt: minutesAgo(1) }),
      task({ id: 't3', stepNum: 3 }),
    ]
    assignPending(tasks, ['a', 'b'], NOW)
    expect(tasks[0].assigneeId).toBe('a')
    expect(tasks[1].assigneeId).toBe('a')
    // 'a' is busy with t2, so the free person takes the new task
    expect(tasks[2].assigneeId).toBe('b')
  })

  it('gives a waiting task no advantage: the free person picks up parallel work while another waits on a timer', () => {
    const tasks = [
      task({ id: 'oven', stepNum: 1, activeMinutes: 2, waitMinutes: 40 }),
      task({ id: 'salad', stepNum: 2, activeMinutes: 10 }),
      task({ id: 'serve', stepNum: 3, dependsOn: ['oven', 'salad'] }),
    ]
    assignPending(tasks, ['a', 'b'], NOW)
    // oven takes 'a' for 2 min only, so 'a' is free to do the salad too
    expect(tasks[0].assigneeId).toBe('a')
    expect(tasks[1].assigneeId).toBe('b')
  })

  it('leaves tasks unassigned when nobody is left', () => {
    const tasks = [task({ id: 't1', stepNum: 1, assigneeId: 'gone' })]
    assignPending(tasks, [], NOW)
    expect(tasks[0].assigneeId).toBeNull()
  })

  it('only fills unassigned tasks when reassignAll is false', () => {
    const tasks = [
      task({ id: 't1', stepNum: 1, assigneeId: 'a' }),
      task({ id: 't2', stepNum: 2 }),
    ]
    assignPending(tasks, ['a', 'b'], NOW, false)
    expect(tasks[0].assigneeId).toBe('a')
    expect(tasks[1].assigneeId).toBe('b')
  })
})

describe('speedFactor', () => {
  it('is 1 with no finished tasks', () => {
    expect(speedFactor([task({ id: 't1', stepNum: 1 })])).toBe(1)
  })

  it('rises when finished tasks took longer than estimated', () => {
    const slow = task({ id: 't1', stepNum: 1, status: 'done', activeMinutes: 10, startedAt: minutesAgo(30), completedAt: minutesAgo(10) })
    expect(speedFactor([slow])).toBeGreaterThan(1)
  })

  it('ignores tasks that include a passive wait or were never started', () => {
    const timed = task({ id: 't1', stepNum: 1, status: 'done', waitMinutes: 30, startedAt: minutesAgo(60), completedAt: minutesAgo(0) })
    const unstarted = task({ id: 't2', stepNum: 2, status: 'done', completedAt: minutesAgo(0) })
    expect(speedFactor([timed, unstarted])).toBe(1)
  })

  it('is clamped', () => {
    const glacial = task({ id: 't1', stepNum: 1, status: 'done', activeMinutes: 1, startedAt: minutesAgo(600), completedAt: minutesAgo(0) })
    expect(speedFactor([glacial])).toBe(2)
  })
})

describe('simulate', () => {
  it('runs dependent tasks after their dependencies', () => {
    const tasks = [
      task({ id: 't1', stepNum: 1, assigneeId: 'a', activeMinutes: 10 }),
      task({ id: 't2', stepNum: 2, assigneeId: 'b', activeMinutes: 5, dependsOn: ['t1'] }),
    ]
    const { finish } = simulate(tasks, ['a', 'b'], NOW, 1, false)
    expect(finish.get('t1')).toBe(10)
    expect(finish.get('t2')).toBe(15)
  })

  it('counts elapsed time of an in-progress task and assumes a minute left once it overruns', () => {
    const running = task({ id: 't1', stepNum: 1, assigneeId: 'a', status: 'in_progress', activeMinutes: 10, startedAt: minutesAgo(4) })
    expect(simulate([running], ['a'], NOW, 1, false).finish.get('t1')).toBeCloseTo(6)
    const overrun = { ...running, startedAt: minutesAgo(25) }
    expect(simulate([overrun], ['a'], NOW, 1, false).finish.get('t1')).toBe(1)
  })

  it('frees the person during the passive wait of an in-progress task', () => {
    const baking = task({ id: 't1', stepNum: 1, assigneeId: 'a', status: 'in_progress', activeMinutes: 5, waitMinutes: 30, startedAt: minutesAgo(10) })
    const { finish, free } = simulate([baking], ['a'], NOW, 1, false)
    expect(free.get('a')).toBe(0)
    expect(finish.get('t1')).toBeCloseTo(25)
  })
})

describe('computeProgress', () => {
  it('reports percent, remaining time and an ETA that follows the critical path', () => {
    const tasks = [
      task({ id: 't1', stepNum: 1, assigneeId: 'a', status: 'done', startedAt: minutesAgo(20), completedAt: minutesAgo(10) }),
      task({ id: 't2', stepNum: 2, assigneeId: 'a', dependsOn: ['t1'] }),
      task({ id: 't3', stepNum: 3, assigneeId: 'b' }),
    ]
    const progress = computeProgress(room(tasks), NOW)
    expect(progress.totalTasks).toBe(3)
    expect(progress.doneTasks).toBe(1)
    expect(progress.percent).toBe(33)
    // two pending 10-minute tasks on different people, but the finished task
    // took 10 of an estimated 10 minutes, so the pace is on plan
    expect(progress.speedFactor).toBe(1)
    expect(progress.remainingMinutes).toBe(10)
    expect(progress.etaAt).toBe(new Date(NOW + 10 * 60000).toISOString())
    expect(progress.perParticipant.find(p => p.userId === 'a')).toMatchObject({ doneTasks: 1, totalTasks: 2, remainingMinutes: 10 })
    expect(Object.keys(progress.taskEtaAt).sort()).toEqual(['t2', 't3'])
  })

  it('pushes the ETA out when the group has been running slow', () => {
    const slow = task({ id: 't1', stepNum: 1, assigneeId: 'a', status: 'done', activeMinutes: 10, startedAt: minutesAgo(50), completedAt: minutesAgo(20) })
    const pending = task({ id: 't2', stepNum: 2, assigneeId: 'a', activeMinutes: 10 })
    const progress = computeProgress(room([slow, pending]), NOW)
    expect(progress.speedFactor).toBeGreaterThan(1)
    expect(progress.remainingMinutes).toBeGreaterThan(10)
  })

  it('has no ETA once everything is done', () => {
    const tasks = [task({ id: 't1', stepNum: 1, assigneeId: 'a', status: 'done' })]
    const progress = computeProgress({ ...room(tasks), status: 'finished' }, NOW)
    expect(progress).toMatchObject({ percent: 100, remainingMinutes: 0, etaAt: null })
  })
})
