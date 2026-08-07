import { ForbiddenException } from '@nestjs/common'
import { FeatureRequestsController } from './feature-requests.controller'

describe('FeatureRequestsController', () => {
  const featureRequestsService = {
    create: jest.fn(),
    list: jest.fn(),
    approve: jest.fn(),
    update: jest.fn(),
    withdraw: jest.fn(),
    deny: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  function makeConfig(ownerUserId: string) {
    return { get: jest.fn().mockReturnValue(ownerUserId) }
  }

  it('GET /feature-requests returns every request to the owner', async () => {
    const all = [
      { number: 1, title: 'A', submittedBy: 'user_1' },
      { number: 2, title: 'B', submittedBy: 'user_2' },
    ]
    featureRequestsService.list.mockResolvedValue(all)
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    await expect(controller.list({ userId: 'owner_1' } as any)).resolves.toEqual(all)
  })

  it('GET /feature-requests only returns a non-owner their own submitted requests', async () => {
    const all = [
      { number: 1, title: 'A', submittedBy: 'user_1' },
      { number: 2, title: 'B', submittedBy: 'user_2' },
    ]
    featureRequestsService.list.mockResolvedValue(all)
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual([all[0]])
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

  it('PATCH /feature-requests/:number edits the request via the service', async () => {
    featureRequestsService.update.mockResolvedValue({ number: 2, title: 'Updated title' })
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    const result = await controller.update(
      2,
      { title: 'Updated title', description: 'Updated body' },
      { userId: 'user_1' } as any,
    )
    expect(featureRequestsService.update).toHaveBeenCalledWith('user_1', 2, 'Updated title', 'Updated body')
    expect(result).toEqual({ number: 2, title: 'Updated title' })
  })

  it('DELETE /feature-requests/:number withdraws the request via the service', async () => {
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    const result = await controller.withdraw(2, { userId: 'user_1' } as any)
    expect(featureRequestsService.withdraw).toHaveBeenCalledWith('user_1', 2)
    expect(result).toEqual({ withdrawn: true })
  })

  it('POST /feature-requests/:number/deny denies when the current user is the owner', async () => {
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    const result = await controller.deny(2, { reason: 'Not a good fit' }, { userId: 'owner_1' } as any)
    expect(featureRequestsService.deny).toHaveBeenCalledWith(2, 'Not a good fit')
    expect(result).toEqual({ denied: true })
  })

  it('POST /feature-requests/:number/deny rejects non-owner users', async () => {
    const controller = new FeatureRequestsController(featureRequestsService as any, makeConfig('owner_1') as any)
    await expect(
      controller.deny(2, { reason: 'Not a good fit' }, { userId: 'someone_else' } as any),
    ).rejects.toThrow(ForbiddenException)
    expect(featureRequestsService.deny).not.toHaveBeenCalled()
  })
})
