import { CookTogetherPlanner } from './cook-together-planner.service'
import { buildTasks } from './cook-together.plan'

describe('CookTogetherPlanner', () => {
  const generateStructured = jest.fn()
  const tasks = buildTasks([{ items: [
    { instruction: 'Chop' }, { instruction: 'Fry' }, { instruction: 'Bake', timerMinutes: 20 }, { instruction: 'Serve' },
  ] }])
  const planner = () => new CookTogetherPlanner({ generateStructured } as any)

  beforeEach(() => jest.clearAllMocks())

  it('uses the model plan when it is usable', async () => {
    generateStructured.mockResolvedValue({ steps: [
      { step: 1, assignee: 0, activeMinutes: 3, waitMinutes: 0, dependsOn: [] },
      { step: 2, assignee: 1, activeMinutes: 5, waitMinutes: 0, dependsOn: [1] },
      { step: 3, assignee: 0, activeMinutes: 2, waitMinutes: 25, dependsOn: [2] },
      { step: 4, assignee: 1, activeMinutes: 1, waitMinutes: 0, dependsOn: [3] },
    ] })
    const result = await planner().plan('Dish', tasks, ['a', 'b'])
    expect(result.source).toBe('ai')
    expect(result.tasks.map(t => t.assigneeId)).toEqual(['a', 'b', 'a', 'b'])
    expect(generateStructured).toHaveBeenCalledWith(expect.stringContaining('2 people are cooking "Dish"'), 0.2)
    // never mutates the caller's tasks
    expect(tasks.every(t => t.assigneeId === null)).toBe(true)
  })

  it('falls back to a greedy split when the model call fails', async () => {
    generateStructured.mockRejectedValue(new Error('GEMINI_API_KEY is not configured'))
    const result = await planner().plan('Dish', tasks, ['a', 'b'])
    expect(result.source).toBe('fallback')
    expect(new Set(result.tasks.map(t => t.assigneeId))).toEqual(new Set(['a', 'b']))
  })

  it('does not call the model for a solo cook', async () => {
    const result = await planner().plan('Dish', tasks, ['a'])
    expect(generateStructured).not.toHaveBeenCalled()
    expect(result.source).toBe('fallback')
    expect(result.tasks.every(t => t.assigneeId === 'a')).toBe(true)
  })

  it('falls back when the model takes too long', async () => {
    jest.useFakeTimers()
    try {
      generateStructured.mockReturnValue(new Promise(() => {}))
      const pending = planner().plan('Dish', tasks, ['a', 'b'])
      await jest.advanceTimersByTimeAsync(21_000)
      await expect(pending).resolves.toMatchObject({ source: 'fallback' })
    } finally {
      jest.useRealTimers()
    }
  })
})
