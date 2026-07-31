import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk-auth.guard'

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
  createClerkClient: jest.fn(() => ({
    users: { getUser: jest.fn().mockResolvedValue({ emailAddresses: [{ emailAddress: 'a@b.com' }], firstName: 'A' }) },
  })),
}))

import { verifyToken } from '@clerk/backend'

function contextWithHeader(header?: string): ExecutionContext {
  const req: any = { headers: header ? { authorization: header } : {} }
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext
}

describe('ClerkAuthGuard', () => {
  const usersService = { upsertFromClerk: jest.fn() }
  const configService = { get: () => 'sk_test_xxx' }
  const reflector = { getAllAndOverride: () => false }

  beforeEach(() => jest.clearAllMocks())

  it('rejects when no Authorization header is present', async () => {
    const guard = new ClerkAuthGuard(reflector as any, configService as any, usersService as any)
    await expect(guard.canActivate(contextWithHeader())).rejects.toThrow(UnauthorizedException)
  })

  it('rejects when token verification fails', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValue(new Error('bad token'))
    const guard = new ClerkAuthGuard(reflector as any, configService as any, usersService as any)
    await expect(guard.canActivate(contextWithHeader('Bearer badtoken'))).rejects.toThrow(UnauthorizedException)
  })

  it('attaches userId and upserts the user on valid token', async () => {
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_1' })
    const guard = new ClerkAuthGuard(reflector as any, configService as any, usersService as any)
    const req: any = { headers: { authorization: 'Bearer goodtoken' } }
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(req.userId).toBe('user_1')
    expect(usersService.upsertFromClerk).toHaveBeenCalledWith('user_1', 'a@b.com', 'A')
  })

  it('allows public routes through without a token', async () => {
    const publicReflector = { getAllAndOverride: () => true }
    const guard = new ClerkAuthGuard(publicReflector as any, configService as any, usersService as any)
    await expect(guard.canActivate(contextWithHeader())).resolves.toBe(true)
    expect(usersService.upsertFromClerk).not.toHaveBeenCalled()
  })
})
