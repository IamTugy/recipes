import { ForbiddenException } from '@nestjs/common'
import { FeatureRequestsController } from './feature-requests.controller'

describe('FeatureRequestsController', () => {
  const featureRequestsService = { create: jest.fn(), list: jest.fn(), approve: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  function makeConfig(ownerUserId: string) {
    return { get: jest.fn().mockReturnValue(ownerUserId) }
  }

  it('GET /feature-requests lists all feature requests', async () => {
    featureRequestsService.list.mockResolvedValue([{ number: 1, title: 'A' }])
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    await expect(controller.list()).resolves.toEqual([{ number: 1, title: 'A' }])
  })

  it('POST /feature-requests creates a feature request for the current user', async () => {
    featureRequestsService.create.mockResolvedValue({ number: 2, title: 'Add dark mode' })
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    const result = await controller.create(
      { title: 'Add dark mode', description: 'Please' },
      { userId: 'user_1' } as any,
    )
    expect(featureRequestsService.create).toHaveBeenCalledWith('user_1', 'Add dark mode', 'Please')
    expect(result).toEqual({ number: 2, title: 'Add dark mode' })
  })

  it('POST /feature-requests/:number/approve approves when the current user is the owner', async () => {
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    const result = await controller.approve(2, { userId: 'owner_1' } as any)
    expect(featureRequestsService.approve).toHaveBeenCalledWith(2)
    expect(result).toEqual({ approved: true })
  })

  it('POST /feature-requests/:number/approve rejects non-owner users', async () => {
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    await expect(controller.approve(2, { userId: 'someone_else' } as any)).rejects.toThrow(ForbiddenException)
    expect(featureRequestsService.approve).not.toHaveBeenCalled()
  })
})
