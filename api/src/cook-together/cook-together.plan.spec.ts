import { applyAiPlan, buildTasks, fallbackEstimate } from './cook-together.plan'

const NOW = Date.now()

describe('buildTasks', () => {
  const groups = [
    { items: [{ instruction: 'Mix dough' }, { instruction: 'Rest dough', timerMinutes: 30 }] },
    { items: [{ instruction: 'Make sauce' }] },
    { items: [{ instruction: 'Assemble and bake', timerMinutes: 20 }] },
  ]

  it('creates one task per step using the cook dock step keys and running step numbers', () => {
    const tasks = buildTasks(groups)
    expect(tasks.map(t => [t.id, t.stepNum])).toEqual([['0-0', 1], ['0-1', 2], ['1-0', 3], ['2-0', 4]])
  })

  it('chains steps within a group, keeps groups independent and makes the last group wait for all', () => {
    const tasks = buildTasks(groups)
    expect(tasks[0].dependsOn).toEqual([])
    expect(tasks[1].dependsOn).toEqual(['0-0'])
    expect(tasks[2].dependsOn).toEqual([])
    expect(tasks[3].dependsOn).toEqual(['0-1', '1-0'])
  })

  it('uses the recipe timer as the passive wait', () => {
    const tasks = buildTasks(groups)
    expect(tasks[1].waitMinutes).toBe(30)
    expect(tasks[0].waitMinutes).toBe(0)
  })
})

describe('fallbackEstimate', () => {
  it('scales hands-on time with instruction length within bounds', () => {
    expect(fallbackEstimate('Stir').activeMinutes).toBe(2)
    expect(fallbackEstimate(Array(400).fill('word').join(' ')).activeMinutes).toBe(15)
  })
})

describe('applyAiPlan', () => {
  const ids = ['a', 'b']
  const fresh = () => buildTasks([{ items: [
    { instruction: 'one' }, { instruction: 'two' }, { instruction: 'three', timerMinutes: 25 }, { instruction: 'four' },
  ] }])

  it('applies assignments, estimates and dependencies from the model', () => {
    const tasks = fresh()
    const timers = new Map([['0-2', 25]])
    const used = applyAiPlan(tasks, { steps: [
      { step: 1, assignee: 0, activeMinutes: 4, waitMinutes: 0, dependsOn: [] },
      { step: 2, assignee: 1, activeMinutes: 6, waitMinutes: 0, dependsOn: [] },
      { step: 3, assignee: 0, activeMinutes: 3, waitMinutes: 40, dependsOn: [1] },
      { step: 4, assignee: 1, activeMinutes: 2, waitMinutes: 0, dependsOn: [2, 3] },
    ] }, ids, timers, NOW)
    expect(used).toBe(true)
    expect(tasks.map(t => t.assigneeId)).toEqual(['a', 'b', 'a', 'b'])
    expect(tasks[2]).toMatchObject({ activeMinutes: 3, waitMinutes: 40, dependsOn: ['0-0'] })
    expect(tasks[3].dependsOn).toEqual(['0-1', '0-2'])
  })

  it('sanitises: clamps numbers, drops forward/unknown deps and never lowers the recipe timer', () => {
    const tasks = fresh()
    applyAiPlan(tasks, { steps: [
      { step: 1, assignee: 0, activeMinutes: 100000, waitMinutes: -5, dependsOn: [] },
      { step: 2, assignee: 1, activeMinutes: 0, waitMinutes: 0, dependsOn: [2, 3, 99, 1.5] },
      { step: 3, assignee: 0, activeMinutes: 3, waitMinutes: 5, dependsOn: [] },
      { step: 4, assignee: 1, activeMinutes: 2, waitMinutes: 0, dependsOn: [] },
    ] }, ids, new Map([['0-2', 25]]), NOW)
    expect(tasks[0]).toMatchObject({ activeMinutes: 180, waitMinutes: 0 })
    expect(tasks[1].activeMinutes).toBe(1)
    expect(tasks[1].dependsOn).toEqual([])
    expect(tasks[2].waitMinutes).toBe(25)
  })

  it('falls back to a greedy split when the model answer is missing or too incomplete', () => {
    for (const ai of [null, undefined, { steps: [] }, { steps: [{ step: 1, assignee: 0, activeMinutes: 1, waitMinutes: 0, dependsOn: [] }] }]) {
      const tasks = fresh()
      expect(applyAiPlan(tasks, ai, ids, new Map(), NOW)).toBe(false)
      expect(tasks.every(t => t.assigneeId === 'a' || t.assigneeId === 'b')).toBe(true)
    }
  })

  it('discards a lopsided AI assignment that leaves someone idle', () => {
    const tasks = fresh()
    applyAiPlan(tasks, { steps: [1, 2, 3, 4].map(step => ({ step, assignee: 0, activeMinutes: 5, waitMinutes: 0, dependsOn: [] })) }, ids, new Map(), NOW)
    expect(tasks.some(t => t.assigneeId === 'b')).toBe(true)
  })

  it('fills in steps whose assignee index is out of range', () => {
    const tasks = fresh()
    applyAiPlan(tasks, { steps: [
      { step: 1, assignee: 0, activeMinutes: 5, waitMinutes: 0, dependsOn: [] },
      { step: 2, assignee: 1, activeMinutes: 5, waitMinutes: 0, dependsOn: [] },
      { step: 3, assignee: 7, activeMinutes: 5, waitMinutes: 0, dependsOn: [] },
      { step: 4, assignee: -1, activeMinutes: 5, waitMinutes: 0, dependsOn: [] },
    ] }, ids, new Map(), NOW)
    expect(tasks.every(t => t.assigneeId)).toBe(true)
    expect(tasks[0].assigneeId).toBe('a')
    expect(tasks[1].assigneeId).toBe('b')
  })
})
