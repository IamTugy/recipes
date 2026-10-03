import { CookTogetherController } from './cook-together.controller'

describe('CookTogetherController', () => {
  const service = {
    getCurrent: jest.fn(), create: jest.fn(), getRoom: jest.fn(), join: jest.fn(), leave: jest.fn(),
    start: jest.fn(), resplit: jest.fn(), claimTask: jest.fn(), startTask: jest.fn(),
    completeTask: jest.fn(), reopenTask: jest.fn(), finish: jest.fn(), cancel: jest.fn(),
  }
  const activityLog = { record: jest.fn() }
  const req = { userId: 'user_1' } as any
  const view = { recipeId: 'recipe_1', code: 'ABC234', participants: [{}, {}], tasks: [{}, {}, {}], planSource: 'ai' }

  beforeEach(() => jest.clearAllMocks())

  function controller() {
    return new CookTogetherController(service as any, activityLog as any)
  }

  it('POST create returns the room and logs cook_together_created', async () => {
    service.create.mockResolvedValue(view)
    await expect(controller().create({ recipeId: 'recipe_1' }, req)).resolves.toBe(view)
    expect(service.create).toHaveBeenCalledWith('user_1', 'recipe_1')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'recipe_1', 'cook_together_created')
  })

  it('POST join logs cook_together_joined with the party size', async () => {
    service.join.mockResolvedValue(view)
    await controller().join('ABC234', req)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'recipe_1', 'cook_together_joined', { participants: 2 })
  })

  it('POST start logs how the work was planned', async () => {
    service.start.mockResolvedValue(view)
    await controller().start('ABC234', req)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'recipe_1', 'cook_together_started', {
      participants: 2, planSource: 'ai', steps: 3,
    })
  })

  it('completing a task logs it, and logs finished for every participant only when the cook completed', async () => {
    service.completeTask.mockResolvedValueOnce({ view })
    await controller().completeTask('ABC234', '0-0', req)
    expect(activityLog.record).toHaveBeenCalledTimes(1)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'recipe_1', 'cook_together_task_completed', { taskId: '0-0' })

    activityLog.record.mockClear()
    service.completeTask.mockResolvedValueOnce({
      view, finished: { participantIds: ['user_1', 'user_2'], recipeId: 'recipe_1', durationMinutes: 42 },
    })
    await controller().completeTask('ABC234', '0-1', req)
    expect(activityLog.record).toHaveBeenCalledWith('user_2', 'recipe_1', 'cook_together_finished', {
      participants: 2, durationMinutes: 42,
    })
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'recipe_1', 'cook_together_finished', {
      participants: 2, durationMinutes: 42,
    })
  })

  it('leave and cancel log without a recipe', async () => {
    await controller().leave('ABC234', req)
    await controller().cancel('ABC234', req)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'cook_together_left')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'cook_together_cancelled')
  })

  it('read endpoints do not log', async () => {
    service.getRoom.mockResolvedValue(view)
    service.getCurrent.mockResolvedValue(null)
    await controller().get('ABC234', req)
    await controller().getCurrent(req)
    expect(activityLog.record).not.toHaveBeenCalled()
  })
})
