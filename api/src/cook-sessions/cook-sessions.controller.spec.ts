import { CookSessionsController } from './cook-sessions.controller'

describe('CookSessionsController', () => {
  const cookSessionsService = {
    startSession: jest.fn(),
    logStep: jest.fn(),
    syncState: jest.fn(),
    getActiveSession: jest.fn(),
    finishSession: jest.fn(),
    abandonSession: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('POST /cook-sessions/:recipeId starts a session for the authenticated user', async () => {
    cookSessionsService.startSession.mockResolvedValue('session_1')
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.start('recipe_a', { userId: 'user_1' } as any)
    expect(cookSessionsService.startSession).toHaveBeenCalledWith('user_1', 'recipe_a')
    expect(result).toEqual({ sessionId: 'session_1' })
  })

  it('POST /cook-sessions/:sessionId/steps logs a step', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const body = { stepKey: '0-0', stepNum: 1, checkedSteps: ['0-0'], checkedIngredients: ['ing-1'] }
    const result = await controller.logStep('session_1', body, { userId: 'user_1' } as any)
    expect(cookSessionsService.logStep).toHaveBeenCalledWith('session_1', 'user_1', '0-0', 1, ['0-0'], ['ing-1'])
    expect(result).toEqual({ ok: true })
  })

  it('POST /cook-sessions/:sessionId/sync updates the resumable snapshot', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const body = { currentStepKey: '0-1', currentStepNum: 2, checkedSteps: ['0-0'], checkedIngredients: ['0-0'] }
    const result = await controller.sync('session_1', body, { userId: 'user_1' } as any)
    expect(cookSessionsService.syncState).toHaveBeenCalledWith('session_1', 'user_1', '0-1', 2, ['0-0'], ['0-0'])
    expect(result).toEqual({ ok: true })
  })

  it('GET /cook-sessions/active/:recipeId returns the active session view for the authenticated user', async () => {
    const view = {
      sessionId: 'session_1', currentStepKey: '0-1', currentStepNum: 2,
      checkedSteps: ['0-0'], checkedIngredients: [], startedAt: '2026-08-14T10:00:00.000Z',
    }
    cookSessionsService.getActiveSession.mockResolvedValue(view)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getActive('recipe_a', { userId: 'user_1' } as any)
    expect(cookSessionsService.getActiveSession).toHaveBeenCalledWith('user_1', 'recipe_a')
    expect(result).toEqual(view)
  })

  it('GET /cook-sessions/active/:recipeId returns null when there is no active session', async () => {
    cookSessionsService.getActiveSession.mockResolvedValue(null)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getActive('recipe_a', { userId: 'user_1' } as any)
    expect(result).toBeNull()
  })

  it('POST /cook-sessions/:sessionId/finish finishes a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.finish('session_1', { userId: 'user_1' } as any)
    expect(cookSessionsService.finishSession).toHaveBeenCalledWith('session_1', 'user_1')
    expect(result).toEqual({ ok: true })
  })

  it('DELETE /cook-sessions/:sessionId abandons a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.abandon('session_1', { userId: 'user_1' } as any)
    expect(cookSessionsService.abandonSession).toHaveBeenCalledWith('session_1', 'user_1')
    expect(result).toEqual({ ok: true })
  })
})
