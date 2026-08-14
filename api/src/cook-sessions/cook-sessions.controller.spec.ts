import { CookSessionsController } from './cook-sessions.controller'

describe('CookSessionsController', () => {
  const cookSessionsService = {
    startSession: jest.fn(),
    logStep: jest.fn(),
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
    const result = await controller.logStep('session_1', { stepKey: '0-0', stepNum: 1 })
    expect(cookSessionsService.logStep).toHaveBeenCalledWith('session_1', '0-0', 1)
    expect(result).toEqual({ ok: true })
  })

  it('POST /cook-sessions/:sessionId/finish finishes a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.finish('session_1')
    expect(cookSessionsService.finishSession).toHaveBeenCalledWith('session_1')
    expect(result).toEqual({ ok: true })
  })

  it('DELETE /cook-sessions/:sessionId abandons a session', async () => {
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.abandon('session_1')
    expect(cookSessionsService.abandonSession).toHaveBeenCalledWith('session_1')
    expect(result).toEqual({ ok: true })
  })
})
