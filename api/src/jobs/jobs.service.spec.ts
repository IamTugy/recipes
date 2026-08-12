import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { JobsService } from './jobs.service'
import { Job } from './schemas/job.schema'

describe('JobsService', () => {
  async function makeService(model: Record<string, unknown>) {
    const moduleRef = await Test.createTestingModule({
      providers: [JobsService, { provide: getModelToken(Job.name), useValue: model }],
    }).compile()
    return moduleRef.get(JobsService)
  }

  it('onModuleInit marks only stale queued/running jobs as failed, scoped by age', async () => {
    const updateMany = jest.fn().mockResolvedValue({})
    const service = await makeService({ updateMany })

    await service.onModuleInit()

    expect(updateMany).toHaveBeenCalledWith(
      {
        $or: [
          { status: 'queued', createdAt: { $lt: expect.any(Date) } },
          { status: 'running', startedAt: { $lt: expect.any(Date) } },
        ],
      },
      { $set: { status: 'failed', finishedAt: expect.any(Date), error: 'Interrupted by a server restart - please retry.' } },
    )
    // the cutoff should be roughly 20 minutes in the past, not "now"
    const cutoff = updateMany.mock.calls[0][0].$or[0].createdAt.$lt as Date
    const ageMs = Date.now() - cutoff.getTime()
    expect(ageMs).toBeGreaterThan(19 * 60 * 1000)
    expect(ageMs).toBeLessThan(21 * 60 * 1000)
  })

  it('create without a dedupeKey always inserts a new job', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'job-1' })
    const service = await makeService({ create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf')

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', type: 'import', label: 'my-recipe.pdf', dedupeKey: undefined, status: 'queued' })
    expect(result).toEqual({ job: { id: 'job-1' }, isExisting: false })
  })

  it('create with a dedupeKey returns an existing queued/running job for the same user instead of inserting', async () => {
    const existingJob = { id: 'job-1', status: 'running' }
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existingJob) })
    const findOne = jest.fn().mockReturnValue({ sort })
    const create = jest.fn()
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1', dedupeKey: 'dedupe-abc' }))
    expect(create).not.toHaveBeenCalled()
    expect(result).toEqual({ job: existingJob, isExisting: true })
  })

  it('create with a dedupeKey inserts a new job when no matching job is found', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const findOne = jest.fn().mockReturnValue({ sort })
    const create = jest.fn().mockResolvedValue({ id: 'job-2' })
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', type: 'import', label: 'my-recipe.pdf', dedupeKey: 'dedupe-abc', status: 'queued' })
    expect(result).toEqual({ job: { id: 'job-2' }, isExisting: false })
  })

  it('create with a dedupeKey falls back to the concurrently-inserted job when create() hits the unique-index race', async () => {
    // First findOne (before the insert attempt) finds nothing; the insert
    // itself then loses a race to a concurrent request and rejects with the
    // partial unique index's duplicate-key error; a second findOne (the
    // recovery path) picks up the job the other request just created.
    const raceWinnerJob = { id: 'job-1', status: 'queued' }
    const findOne = jest.fn()
      .mockReturnValueOnce({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) })
      .mockReturnValueOnce({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(raceWinnerJob) }) })
    const create = jest.fn().mockRejectedValue({ code: 11000 })
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    expect(findOne).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ job: raceWinnerJob, isExisting: true })
  })

  it('create rethrows a create() failure that is not a duplicate-key error', async () => {
    const findOne = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) })
    const create = jest.fn().mockRejectedValue(new Error('Mongo is down'))
    const service = await makeService({ findOne, create })

    await expect(service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')).rejects.toThrow('Mongo is down')
  })

  it('create without a dedupeKey rethrows any create() failure (no recovery path without a dedupeKey)', async () => {
    const create = jest.fn().mockRejectedValue({ code: 11000 })
    const service = await makeService({ create })

    await expect(service.create('user_1', 'import', 'my-recipe.pdf')).rejects.toEqual({ code: 11000 })
  })

  it('create with a dedupeKey does NOT match a failed job within the window - a new job is created instead', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const findOne = jest.fn().mockReturnValue({ sort })
    const create = jest.fn().mockResolvedValue({ id: 'job-3' })
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    const query = findOne.mock.calls[0][0]
    // the $or clauses must only cover queued/running (any age) and done
    // (within the window) - failed must not appear as a match condition
    expect(query.$or).toEqual([
      { status: { $in: ['queued', 'running'] } },
      { status: 'done', finishedAt: { $gte: expect.any(Date) } },
    ])
    expect(create).toHaveBeenCalled()
    expect(result).toEqual({ job: { id: 'job-3' }, isExisting: false })
  })

  it('run sets status to running then done with the result ids on success', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await service.run('job-1', async () => ['recipe-a', 'recipe-b'])

    expect(updateOne).toHaveBeenNthCalledWith(1, { _id: 'job-1' }, { $set: { status: 'running', startedAt: expect.any(Date) } })
    expect(updateOne).toHaveBeenNthCalledWith(2, { _id: 'job-1' }, { $set: { status: 'done', finishedAt: expect.any(Date), resultRecipeIds: ['recipe-a', 'recipe-b'] } })
  })

  it('run sets status to failed with the error message when the work throws', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await service.run('job-1', async () => { throw new Error('extraction failed') })

    expect(updateOne).toHaveBeenNthCalledWith(2, { _id: 'job-1' }, { $set: { status: 'failed', finishedAt: expect.any(Date), error: 'extraction failed' } })
  })

  it('run never throws even when the work rejects', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await expect(service.run('job-1', async () => { throw new Error('boom') })).resolves.toBeUndefined()
  })

  it('run never throws even when the initial "set to running" update rejects (e.g. a transient Mongo blip)', async () => {
    const updateOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockRejectedValue(new Error('mongo blip')) })
      .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService({ updateOne })

    await expect(service.run('job-1', async () => ['recipe-a'])).resolves.toBeUndefined()

    expect(updateOne).toHaveBeenNthCalledWith(2, { _id: 'job-1' }, { $set: { status: 'failed', finishedAt: expect.any(Date), error: 'mongo blip' } })
  })

  it('run resolves without throwing even when the failure-write itself also rejects', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockRejectedValue(new Error('mongo down')) })
    const service = await makeService({ updateOne })

    await expect(service.run('job-1', async () => { throw new Error('boom') })).resolves.toBeUndefined()
  })

  it('listMine returns the user\'s jobs sorted newest-first, capped at 50', async () => {
    const exec = jest.fn().mockResolvedValue([{ id: 'job-1' }])
    const limit = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    const result = await service.listMine('user_1')

    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(limit).toHaveBeenCalledWith(50)
    expect(result).toEqual([{ id: 'job-1' }])
  })

  it('listMine with activeOnly filters to queued/running jobs', async () => {
    const exec = jest.fn().mockResolvedValue([])
    const limit = jest.fn().mockReturnValue({ exec })
    const sort = jest.fn().mockReturnValue({ limit })
    const find = jest.fn().mockReturnValue({ sort })
    const service = await makeService({ find })

    await service.listMine('user_1', true)

    expect(find).toHaveBeenCalledWith({ userId: 'user_1', status: { $in: ['queued', 'running'] } })
  })
})
