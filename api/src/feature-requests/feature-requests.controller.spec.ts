import { ForbiddenException } from '@nestjs/common'
import { FeatureRequestsController } from './feature-requests.controller'

describe('FeatureRequestsController', () => {
  const featureRequestsService = {
    create: jest.fn(),
    list: jest.fn(),
    approve: jest.fn(),
    unapprove: jest.fn(),
    update: jest.fn(),
    withdraw: jest.fn(),
    deny: jest.fn(),
  }
  const activityLog = { record: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  function makeConfig(ownerUserId: string) {
    return { get: jest.fn().mockReturnValue(ownerUserId) }
  }

  function makeController(ownerUserId: string) {
    return new FeatureRequestsController(featureRequestsService as any, makeConfig(ownerUserId) as any, activityLog as any)
  }

  it('GET /feature-requests returns every request to the owner', async () => {
    const all = [
      { number: 1, title: 'A', submittedBy: 'user_1' },
      { number: 2, title: 'B', submittedBy: 'user_2' },
    ]
    featureRequestsService.list.mockResolvedValue(all)
    const controller = makeController('owner_1')
    await expect(controller.list({ userId: 'owner_1' } as any)).resolves.toEqual(all)
  })

  it('GET /feature-requests only returns a non-owner their own submitted requests', async () => {
    const all = [
      { number: 1, title: 'A', submittedBy: 'user_1' },
      { number: 2, title: 'B', submittedBy: 'user_2' },
    ]
    featureRequestsService.list.mockResolvedValue(all)
    const controller = makeController('owner_1')
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual([all[0]])
  })

  it('POST /feature-requests creates a feature request for the current user', async () => {
    featureRequestsService.create.mockResolvedValue({ number: 2, title: 'Add dark mode' })
    const controller = makeController('owner_1')
    const result = await controller.create(
      { title: 'Add dark mode', description: 'Please' },
      { userId: 'user_1' } as any,
    )
    expect(featureRequestsService.create).toHaveBeenCalledWith('user_1', 'Add dark mode', 'Please')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'feature_request_submitted', { title: 'Add dark mode' })
    expect(result).toEqual({ number: 2, title: 'Add dark mode' })
  })

  it('POST /feature-requests/:number/approve approves when the current user is the owner', async () => {
    const controller = makeController('owner_1')
    const result = await controller.approve(2, { userId: 'owner_1' } as any)
    expect(featureRequestsService.approve).toHaveBeenCalledWith(2)
    expect(activityLog.record).toHaveBeenCalledWith('owner_1', undefined, 'feature_request_approved', { number: 2 })
    expect(result).toEqual({ approved: true })
  })

  it('POST /feature-requests/:number/approve rejects non-owner users', async () => {
    const controller = makeController('owner_1')
    await expect(controller.approve(2, { userId: 'someone_else' } as any)).rejects.toThrow(ForbiddenException)
    expect(featureRequestsService.approve).not.toHaveBeenCalled()
  })

  it('POST /feature-requests/:number/unapprove unapproves when the current user is the owner', async () => {
    const controller = makeController('owner_1')
    const result = await controller.unapprove(2, { userId: 'owner_1' } as any)
    expect(featureRequestsService.unapprove).toHaveBeenCalledWith(2)
    expect(activityLog.record).toHaveBeenCalledWith('owner_1', undefined, 'feature_request_unapproved', { number: 2 })
    expect(result).toEqual({ unapproved: true })
  })

  it('POST /feature-requests/:number/unapprove rejects non-owner users', async () => {
    const controller = makeController('owner_1')
    await expect(controller.unapprove(2, { userId: 'someone_else' } as any)).rejects.toThrow(ForbiddenException)
    expect(featureRequestsService.unapprove).not.toHaveBeenCalled()
  })

  it('PATCH /feature-requests/:number edits the request via the service', async () => {
    featureRequestsService.update.mockResolvedValue({ number: 2, title: 'Updated title' })
    const controller = makeController('owner_1')
    const result = await controller.update(
      2,
      { title: 'Updated title', description: 'Updated body' },
      { userId: 'user_1' } as any,
    )
    expect(featureRequestsService.update).toHaveBeenCalledWith('user_1', 2, 'Updated title', 'Updated body')
    expect(result).toEqual({ number: 2, title: 'Updated title' })
  })

  it('DELETE /feature-requests/:number withdraws the request via the service', async () => {
    const controller = makeController('owner_1')
    const result = await controller.withdraw(2, { userId: 'user_1' } as any)
    expect(featureRequestsService.withdraw).toHaveBeenCalledWith('user_1', 2)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'feature_request_withdrawn', { number: 2 })
    expect(result).toEqual({ withdrawn: true })
  })

  it('POST /feature-requests/:number/deny denies when the current user is the owner', async () => {
    const controller = makeController('owner_1')
    const result = await controller.deny(2, { reason: 'Not a good fit' }, { userId: 'owner_1' } as any)
    expect(featureRequestsService.deny).toHaveBeenCalledWith(2, 'Not a good fit')
    expect(activityLog.record).toHaveBeenCalledWith('owner_1', undefined, 'feature_request_denied', { number: 2, reason: 'Not a good fit' })
    expect(result).toEqual({ denied: true })
  })

  it('POST /feature-requests/:number/deny rejects non-owner users', async () => {
    const controller = makeController('owner_1')
    await expect(
      controller.deny(2, { reason: 'Not a good fit' }, { userId: 'someone_else' } as any),
    ).rejects.toThrow(ForbiddenException)
    expect(featureRequestsService.deny).not.toHaveBeenCalled()
  })
})
