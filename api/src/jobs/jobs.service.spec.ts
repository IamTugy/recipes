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

  it('onModuleInit marks any queued/running job as failed', async () => {
    const updateMany = jest.fn().mockResolvedValue({})
    const service = await makeService({ updateMany })

    await service.onModuleInit()

    expect(updateMany).toHaveBeenCalledWith(
      { status: { $in: ['queued', 'running'] } },
      { $set: { status: 'failed', finishedAt: expect.any(Date), error: 'Interrupted by a server restart - please retry.' } },
    )
  })

  it('create without a dedupeKey always inserts a new job', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'job-1' })
    const service = await makeService({ create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf')

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', type: 'import', label: 'my-recipe.pdf', dedupeKey: undefined, status: 'queued' })
    expect(result).toEqual({ id: 'job-1' })
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
    expect(result).toBe(existingJob)
  })

  it('create with a dedupeKey inserts a new job when no matching job is found', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const findOne = jest.fn().mockReturnValue({ sort })
    const create = jest.fn().mockResolvedValue({ id: 'job-2' })
    const service = await makeService({ findOne, create })

    const result = await service.create('user_1', 'import', 'my-recipe.pdf', 'dedupe-abc')

    expect(create).toHaveBeenCalledWith({ userId: 'user_1', type: 'import', label: 'my-recipe.pdf', dedupeKey: 'dedupe-abc', status: 'queued' })
    expect(result).toEqual({ id: 'job-2' })
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
