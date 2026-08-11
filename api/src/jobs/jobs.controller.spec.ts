import mongoose from 'mongoose'
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'
import { Job, JobSchema } from './schemas/job.schema'

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

  it('a real Job document\'s .toObject() includes an id field matching the string form of _id (regression test for missing virtuals: true)', () => {
    // Uses the actual JobSchema/Job model rather than a mocked toObject(), so
    // this fails if `virtuals: true` is ever removed from @Schema(...) - the
    // mocked toObject() in the tests above wouldn't catch that regression.
    const JobModel = mongoose.model(`Job_${Date.now()}`, JobSchema)
    const job = new JobModel({ userId: 'user_1', type: 'import', status: 'queued' } as Partial<Job>)

    const obj = job.toObject() as unknown as { id: string }

    expect(obj.id).toBe(job._id.toString())
  })
})
