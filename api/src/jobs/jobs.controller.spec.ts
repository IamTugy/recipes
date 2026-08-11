import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'

describe('JobsController', () => {
  const jobsService = { listMine: jest.fn() }
  const controller = new JobsController(jobsService as unknown as JobsService)

  beforeEach(() => jest.clearAllMocks())

  it('GET /jobs returns the current user\'s jobs', async () => {
    jobsService.listMine.mockResolvedValue([{ toObject: () => ({ id: 'job-1' }) }])

    const result = await controller.list(undefined, { userId: 'user_1' } as any)

    expect(jobsService.listMine).toHaveBeenCalledWith('user_1', false)
    expect(result).toEqual([{ id: 'job-1' }])
  })

  it('GET /jobs?status=active only fetches active jobs', async () => {
    jobsService.listMine.mockResolvedValue([])

    await controller.list('active', { userId: 'user_1' } as any)

    expect(jobsService.listMine).toHaveBeenCalledWith('user_1', true)
  })
})
