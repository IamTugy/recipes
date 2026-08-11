import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { RecipeImportService } from '../import/recipe-import.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { JobsService } from '../../jobs/jobs.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const importService = { resolveLinks: jest.fn() }
  const recipesService = { createDraft: jest.fn(), updateDraft: jest.fn(), findLinkCandidates: jest.fn() }
  const activityLog = { record: jest.fn() }
  const jobsService = { create: jest.fn(), run: jest.fn() }
  const controller = new RecipeAiGenerateController(
    aiGenerateService as unknown as RecipeAiGenerateService,
    importService as unknown as RecipeImportService,
    recipesService as unknown as RecipesService,
    activityLog as unknown as ActivityLogService,
    jobsService as unknown as JobsService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    recipesService.findLinkCandidates.mockResolvedValue([])
    importService.resolveLinks.mockResolvedValue([])
  })

  describe('generate() - job creation', () => {
    it('creates a job and returns its id immediately without waiting for generation to finish', async () => {
      jobsService.create.mockResolvedValue({ job: { id: 'job-1' }, isExisting: false })
      jobsService.run.mockReturnValue(new Promise(() => {})) // never resolves during the test

      const result = await controller.generate({ query: 'chocolate cake' }, { userId: 'user_1' } as any)

      expect(result).toEqual({ jobId: 'job-1' })
      expect(jobsService.create).toHaveBeenCalledWith('user_1', 'ai_generate', 'chocolate cake', expect.any(String))
      expect(jobsService.run).toHaveBeenCalledWith('job-1', expect.any(Function))
    })

    it('returns the existing job id without starting new work when create() reports a dedupe match', async () => {
      jobsService.create.mockResolvedValue({ job: { id: 'job-1' }, isExisting: true })

      const result = await controller.generate({ query: 'chocolate cake' }, { userId: 'user_1' } as any)

      expect(result).toEqual({ jobId: 'job-1' })
      expect(jobsService.run).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when no query is provided, without creating a job', async () => {
      await expect(controller.generate({}, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
      expect(jobsService.create).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when the query is blank', async () => {
      await expect(controller.generate({ query: '   ' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
    })

    it('uses the same dedupeKey for the same query regardless of casing/whitespace', async () => {
      jobsService.create.mockResolvedValue({ job: { id: 'job-1' }, isExisting: false })
      jobsService.run.mockReturnValue(new Promise(() => {}))

      await controller.generate({ query: 'Chocolate Cake' }, { userId: 'user_1' } as any)
      await controller.generate({ query: '  chocolate cake  ' }, { userId: 'user_1' } as any)

      const keys = jobsService.create.mock.calls.map(call => call[3])
      expect(keys[0]).toBe(keys[1])
    })
  })

  describe('runGenerate() - the actual generation work', () => {
    function runGenerate(query: string) {
      return (controller as any).runGenerate(query, 'user_1')
    }

    it('generates then persists each recipe as a pending-review draft sharing one batchId', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { title: 'Chocolate Cake', aiGenerated: true, sources: [] },
        { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })
        .mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

      const result = await runGenerate('chocolate cake and vanilla frosting')

      expect(recipesService.createDraft).toHaveBeenCalledTimes(2)
      expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
      expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
      expect(recipesService.createDraft.mock.calls[0][0]).toBe('user_1')
      expect(result).toEqual(['a', 'b'])
    })

    it('logs an ai_recipe_generate_used event with the batch size after a successful generation', async () => {
      aiGenerateService.generate.mockResolvedValue([{ title: 'Soup', aiGenerated: true, sources: [] }])
      recipesService.createDraft.mockResolvedValue({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runGenerate('tomato soup')

      expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used', { count: 1 })
    })

    it('skips a malformed generated recipe (missing title) but still persists and returns the other valid one(s) in the batch', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { aiGenerated: true, sources: [] }, // no title -> fails validation
        { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

      const result = await runGenerate('vanilla frosting')

      expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['b'])
    })

    it('throws BadRequestException without persisting anything when every recipe in the batch fails validation', async () => {
      aiGenerateService.generate.mockResolvedValue([{ aiGenerated: true, sources: [] }])

      await expect(runGenerate('anything')).rejects.toThrow(BadRequestException)
      expect(recipesService.createDraft).not.toHaveBeenCalled()
    })

    it('links a generated recipe to an existing app recipe when resolveLinks finds a confident match', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { title: 'Chocolate Cake', aiGenerated: true, sources: [], ingredients: [{ items: [{ name: 'vanilla frosting' }] }] },
      ])
      recipesService.findLinkCandidates.mockResolvedValue([{ id: 'existing-1', title: 'Vanilla Frosting' }])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })

      await runGenerate('chocolate cake')

      expect(recipesService.createDraft.mock.calls[0][1].ingredients).toEqual([
        { items: [{ name: 'vanilla frosting', linkedRecipeId: 'existing-1' }] },
      ])
    })

    it('links two recipes generated in the same batch to each other after both are created', async () => {
      aiGenerateService.generate.mockResolvedValue([
        { title: 'Chocolate Cake', aiGenerated: true, sources: [], ingredients: [{ items: [{ name: 'vanilla frosting' }] }] },
        { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
      ])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToRecipeIndex: 1 },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'cake-id', toObject: () => ({ id: 'cake-id', title: 'Chocolate Cake' }) })
        .mockResolvedValueOnce({ id: 'frosting-id', toObject: () => ({ id: 'frosting-id', title: 'Vanilla Frosting' }) })
      recipesService.updateDraft.mockResolvedValue({ toObject: () => ({ id: 'cake-id', title: 'Chocolate Cake', linked: true }) })

      const result = await runGenerate('chocolate cake and vanilla frosting')

      expect(recipesService.updateDraft).toHaveBeenCalledWith(
        'cake-id',
        'user_1',
        false,
        expect.objectContaining({ ingredients: [{ items: [{ name: 'vanilla frosting', linkedRecipeId: 'frosting-id' }] }] }),
      )
      expect(result).toEqual(['cake-id', 'frosting-id'])
    })
  })
})
