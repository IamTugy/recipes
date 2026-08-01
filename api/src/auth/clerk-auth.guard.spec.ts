import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk-auth.guard'

const mockGetUser = jest.fn()

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
  createClerkClient: jest.fn(() => ({ users: { getUser: mockGetUser } })),
}))

import { verifyToken, createClerkClient } from '@clerk/backend'

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

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUser.mockResolvedValue({ emailAddresses: [{ emailAddress: 'a@b.com' }], firstName: 'A' })
  })

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

  it('constructs the Clerk client once, not per request', async () => {
    ;(createClerkClient as jest.Mock).mockClear()
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_1' })
    const guard = new ClerkAuthGuard(reflector as any, configService as any, usersService as any)
    expect(createClerkClient).toHaveBeenCalledTimes(1)

    await guard.canActivate(contextWithHeader('Bearer goodtoken'))
    await guard.canActivate(contextWithHeader('Bearer goodtoken'))
    expect(createClerkClient).toHaveBeenCalledTimes(1)
  })

  it('still authorizes when the Clerk getUser call fails', async () => {
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_1' })
    mockGetUser.mockRejectedValue(new Error('clerk is down'))
    const guard = new ClerkAuthGuard(reflector as any, configService as any, usersService as any)
    const context = contextWithHeader('Bearer goodtoken')
    const req = context.switchToHttp().getRequest()

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(req.userId).toBe('user_1')
    expect(usersService.upsertFromClerk).not.toHaveBeenCalled()
  })

  it('still authorizes when the profile upsert fails', async () => {
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_1' })
    usersService.upsertFromClerk.mockRejectedValue(new Error('mongo is down'))
    const guard = new ClerkAuthGuard(reflector as any, configService as any, usersService as any)
    const context = contextWithHeader('Bearer goodtoken')
    const req = context.switchToHttp().getRequest()

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(req.userId).toBe('user_1')
  })

  it('authenticates as the owner via the personal API key, bypassing Clerk entirely', async () => {
    const apiKeyConfig = { get: (key: string) => (key === 'RECIPES_API_KEY' ? 'secret123' : key === 'OWNER_USER_ID' ? 'owner_1' : 'sk_test_xxx') }
    const guard = new ClerkAuthGuard(reflector as any, apiKeyConfig as any, usersService as any)
    const context = contextWithHeader('Bearer secret123')
    const req = context.switchToHttp().getRequest()

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(req.userId).toBe('owner_1')
    expect(verifyToken).not.toHaveBeenCalled()
    expect(usersService.upsertFromClerk).not.toHaveBeenCalled()
  })

  it('falls through to normal Clerk verification when the token does not match the API key', async () => {
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_1' })
    const apiKeyConfig = { get: (key: string) => (key === 'RECIPES_API_KEY' ? 'secret123' : key === 'OWNER_USER_ID' ? 'owner_1' : 'sk_test_xxx') }
    const guard = new ClerkAuthGuard(reflector as any, apiKeyConfig as any, usersService as any)
    const context = contextWithHeader('Bearer someone-elses-token')
    const req = context.switchToHttp().getRequest()

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(req.userId).toBe('user_1')
    expect(verifyToken).toHaveBeenCalled()
  })
})
