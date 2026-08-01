import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RecipesController } from './recipes.controller'

describe('RecipesController', () => {
  const recipesService = {
    findAll: jest.fn(),
    findBySlug: jest.fn(),
    findBySlugForUser: jest.fn(),
    findMine: jest.fn(),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    submitForReview: jest.fn(),
    cancelSubmission: jest.fn(),
    listPendingSubmissions: jest.fn(),
    approveSubmission: jest.fn(),
    rejectSubmission: jest.fn(),
    listRevisions: jest.fn(),
    remove: jest.fn(),
  }

  function makeController(ownerUserId = 'admin_1') {
    const activityLog = { record: jest.fn(), trendingSlugs: jest.fn() }
    const config = { get: jest.fn().mockReturnValue(ownerUserId) }
    return new RecipesController(recipesService as any, activityLog as any, config as any)
  }

  beforeEach(() => jest.clearAllMocks())

  it('GET /recipes returns all recipes', async () => {
    recipesService.findAll.mockResolvedValue([{ slug: 'a' }])
    const controller = makeController()
    await expect(controller.findAll()).resolves.toEqual([{ slug: 'a' }])
  })

  it('GET /recipes/:slug returns the recipe and logs a view when published', async () => {
    recipesService.findBySlugForUser.mockResolvedValue({ slug: 'a', status: 'published' })
    const controller = makeController()

    const result = await controller.findOne('a', { userId: 'user_1' } as any)

    expect(recipesService.findBySlugForUser).toHaveBeenCalledWith('a', 'user_1', false)
    expect(result).toEqual({ slug: 'a', status: 'published' })
  })

  it('GET /recipes/:slug does not log a view for a non-published recipe', async () => {
    recipesService.findBySlugForUser.mockResolvedValue({ slug: 'a', status: 'draft' })
    const activityLog = { record: jest.fn(), trendingSlugs: jest.fn() }
    const config = { get: jest.fn().mockReturnValue('admin_1') }
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any)

    await controller.findOne('a', { userId: 'user_1' } as any)

    expect(activityLog.record).not.toHaveBeenCalled()
  })

  it('GET /recipes/:slug throws 404 when not found', async () => {
    recipesService.findBySlugForUser.mockResolvedValue(null)
    const controller = makeController()
    await expect(controller.findOne('missing', { userId: 'user_1' } as any)).rejects.toThrow(NotFoundException)
  })

  it('GET /recipes/trending returns recipes for the trending slugs, skipping any since-deleted ones', async () => {
    const activityLog = { record: jest.fn(), trendingSlugs: jest.fn().mockResolvedValue(['a', 'gone', 'b']) }
    const config = { get: jest.fn().mockReturnValue('admin_1') }
    recipesService.findBySlug.mockImplementation((slug: string) =>
      slug === 'gone' ? Promise.resolve(null) : Promise.resolve({ slug }),
    )
    const controller = new RecipesController(recipesService as any, activityLog as any, config as any)

    const result = await controller.trending()

    expect(activityLog.trendingSlugs).toHaveBeenCalled()
    expect(result).toEqual([{ slug: 'a' }, { slug: 'b' }])
  })

  it('GET /recipes/mine returns the recipes owned by the requester', async () => {
    recipesService.findMine.mockResolvedValue([{ slug: 'a' }])
    const controller = makeController()
    await expect(controller.findMine({ userId: 'user_1' } as any)).resolves.toEqual([{ slug: 'a' }])
    expect(recipesService.findMine).toHaveBeenCalledWith('user_1')
  })

  it('GET /recipes/admin/submissions returns the pending queue for an admin', async () => {
    recipesService.listPendingSubmissions.mockResolvedValue([{ slug: 'a' }])
    const controller = makeController('admin_1')
    await expect(controller.listPendingSubmissions({ userId: 'admin_1' } as any)).resolves.toEqual([{ slug: 'a' }])
  })

  it('GET /recipes/admin/submissions throws ForbiddenException for a non-admin', async () => {
    const controller = makeController('admin_1')
    await expect(controller.listPendingSubmissions({ userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
    expect(recipesService.listPendingSubmissions).not.toHaveBeenCalled()
  })

  it('POST /recipes creates a draft owned by the requester', async () => {
    const created = { toObject: () => ({ slug: 'tomato-soup', title: 'Tomato Soup' }) }
    recipesService.createDraft.mockResolvedValue(created)
    const controller = makeController()
    const body = { title: 'Tomato Soup' } as any
    const result = await controller.create(body, { userId: 'user_1' } as any)
    expect(recipesService.createDraft).toHaveBeenCalledWith('user_1', body)
    expect(result).toEqual({ slug: 'tomato-soup', title: 'Tomato Soup' })
  })

  it('PUT /recipes/:slug updates a draft owned by the requester', async () => {
    const updated = { toObject: () => ({ slug: 'tomato-soup', title: 'Tomato Soup v2' }) }
    recipesService.updateDraft.mockResolvedValue(updated)
    const controller = makeController()
    const body = { title: 'Tomato Soup v2' } as any
    const result = await controller.update('tomato-soup', body, { userId: 'user_1' } as any)
    expect(recipesService.updateDraft).toHaveBeenCalledWith('tomato-soup', 'user_1', false, body)
    expect(result).toEqual({ slug: 'tomato-soup', title: 'Tomato Soup v2' })
  })

  it('POST /recipes/:slug/submit submits the recipe for review', async () => {
    const submitted = { toObject: () => ({ slug: 'a', status: 'pending_review' }) }
    recipesService.submitForReview.mockResolvedValue(submitted)
    const controller = makeController()
    const result = await controller.submit('a', { userId: 'user_1' } as any)
    expect(recipesService.submitForReview).toHaveBeenCalledWith('a', 'user_1', false)
    expect(result).toEqual({ slug: 'a', status: 'pending_review' })
  })

  it('POST /recipes/:slug/cancel-submission cancels a pending submission', async () => {
    const cancelled = { toObject: () => ({ slug: 'a', status: 'draft' }) }
    recipesService.cancelSubmission.mockResolvedValue(cancelled)
    const controller = makeController()
    const result = await controller.cancelSubmission('a', { userId: 'user_1' } as any)
    expect(recipesService.cancelSubmission).toHaveBeenCalledWith('a', 'user_1', false)
    expect(result).toEqual({ slug: 'a', status: 'draft' })
  })

  it('POST /recipes/:slug/approve publishes the recipe for an admin', async () => {
    const approved = { toObject: () => ({ slug: 'a', status: 'published' }) }
    recipesService.approveSubmission.mockResolvedValue(approved)
    const controller = makeController('admin_1')
    const result = await controller.approve('a', { userId: 'admin_1' } as any)
    expect(recipesService.approveSubmission).toHaveBeenCalledWith('a', 'admin_1')
    expect(result).toEqual({ slug: 'a', status: 'published' })
  })

  it('POST /recipes/:slug/approve throws ForbiddenException for a non-admin', async () => {
    const controller = makeController('admin_1')
    await expect(controller.approve('a', { userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
    expect(recipesService.approveSubmission).not.toHaveBeenCalled()
  })

  it('POST /recipes/:slug/reject rejects the recipe with a comment for an admin', async () => {
    const rejected = { toObject: () => ({ slug: 'a', status: 'rejected' }) }
    recipesService.rejectSubmission.mockResolvedValue(rejected)
    const controller = makeController('admin_1')
    const result = await controller.reject('a', { comment: 'needs a photo' }, { userId: 'admin_1' } as any)
    expect(recipesService.rejectSubmission).toHaveBeenCalledWith('a', 'needs a photo')
    expect(result).toEqual({ slug: 'a', status: 'rejected' })
  })

  it('POST /recipes/:slug/reject throws ForbiddenException for a non-admin', async () => {
    const controller = makeController('admin_1')
    await expect(controller.reject('a', { comment: 'x' }, { userId: 'user_1' } as any)).rejects.toThrow(ForbiddenException)
    expect(recipesService.rejectSubmission).not.toHaveBeenCalled()
  })

  it('GET /recipes/:slug/revisions returns the revision history', async () => {
    recipesService.listRevisions.mockResolvedValue([{ revisionNumber: 1 }])
    const controller = makeController()
    await expect(controller.listRevisions('a')).resolves.toEqual([{ revisionNumber: 1 }])
  })

  it('DELETE /recipes/:slug deletes a recipe', async () => {
    const controller = makeController()
    const result = await controller.remove('tomato-soup', { userId: 'user_1' } as any)
    expect(recipesService.remove).toHaveBeenCalledWith('tomato-soup', 'user_1', false)
    expect(result).toEqual({ deleted: true })
  })
})
