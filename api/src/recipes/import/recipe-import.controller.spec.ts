import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { JobsService } from '../../jobs/jobs.service'

describe('RecipeImportController', () => {
  const importService = {
    importFromText: jest.fn(),
    importFromUrl: jest.fn(),
    importFromFile: jest.fn(),
    importFromImage: jest.fn(),
    resolveLinks: jest.fn(),
  }
  const recipesService = { createDraft: jest.fn(), updateDraft: jest.fn(), findLinkCandidates: jest.fn() }
  const activityLog = { record: jest.fn() }
  const jobsService = { create: jest.fn(), run: jest.fn() }
  const controller = new RecipeImportController(
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

  describe('import() - job creation', () => {
    it('creates a job and returns its id immediately without waiting for the import to finish', async () => {
      jobsService.create.mockResolvedValue({ id: 'job-1' })
      jobsService.run.mockReturnValue(new Promise(() => {})) // never resolves during the test

      const result = await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)

      expect(result).toEqual({ jobId: 'job-1' })
      expect(jobsService.create).toHaveBeenCalledWith('user_1', 'import', expect.any(String), expect.any(String))
      expect(jobsService.run).toHaveBeenCalledWith('job-1', expect.any(Function))
    })

    it('throws BadRequestException when no source is provided, without creating a job', async () => {
      await expect(controller.import({}, { userId: 'user_1' } as any, undefined)).rejects.toThrow(BadRequestException)
      expect(jobsService.create).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when a url is combined with a file or a photo', async () => {
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File
      await expect(controller.import({ url: 'https://example.com' }, { userId: 'user_1' } as any, { file: [file] })).rejects.toThrow(BadRequestException)
      await expect(controller.import({ url: 'https://example.com' }, { userId: 'user_1' } as any, { image: [image] })).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when a file and a photo are both provided', async () => {
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File
      await expect(controller.import({}, { userId: 'user_1' } as any, { file: [file], image: [image] })).rejects.toThrow(BadRequestException)
    })

    it('uses the same dedupeKey for two identical text submissions and a different key for a different source', async () => {
      jobsService.create.mockResolvedValue({ id: 'job-1' })
      jobsService.run.mockReturnValue(new Promise(() => {}))

      await controller.import({ text: 'same text' }, { userId: 'user_1' } as any, undefined)
      await controller.import({ text: 'same text' }, { userId: 'user_1' } as any, undefined)
      await controller.import({ text: 'different text' }, { userId: 'user_1' } as any, undefined)

      const keys = jobsService.create.mock.calls.map(call => call[3])
      expect(keys[0]).toBe(keys[1])
      expect(keys[0]).not.toBe(keys[2])
    })
  })

  describe('runImport() - the actual import work', () => {
    function runImport(body: { text?: string; url?: string }, files?: { file?: Express.Multer.File; image?: Express.Multer.File }) {
      return (controller as any).runImport(body, 'user_1', files?.file, files?.image)
    }

    it('imports from text when only text is provided', async () => {
      importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      const result = await runImport({ text: 'some recipe text' })

      expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
      expect(result).toEqual(['a'])
    })

    it('imports from url when only url is provided', async () => {
      importService.importFromUrl.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runImport({ url: 'https://example.com/soup' })

      expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup', undefined)
    })

    it('imports from url with the caption text combined when a social share provides both', async () => {
      importService.importFromUrl.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runImport({ url: 'https://www.instagram.com/reel/abc', text: 'Best soup ever, recipe below' })

      expect(importService.importFromUrl).toHaveBeenCalledWith('https://www.instagram.com/reel/abc', 'Best soup ever, recipe below')
    })

    it('imports from file when only a file is provided', async () => {
      importService.importFromFile.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      await runImport({}, { file })

      expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf', undefined)
    })

    it('imports from file with the prompt text combined when both are provided', async () => {
      importService.importFromFile.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      await runImport({ text: 'make it vegan' }, { file })

      expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf', 'make it vegan')
    })

    it('imports from a photo when only an image is provided', async () => {
      importService.importFromImage.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File

      await runImport({}, { image })

      expect(importService.importFromImage).toHaveBeenCalledWith(image.buffer, 'image/jpeg', undefined)
    })

    it('imports from a photo with the prompt text combined when both are provided', async () => {
      importService.importFromImage.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })
      const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File

      await runImport({ text: 'make it vegan' }, { image })

      expect(importService.importFromImage).toHaveBeenCalledWith(image.buffer, 'image/jpeg', 'make it vegan')
    })

    it('logs an ai_recipe_import_used event after a successful import', async () => {
      importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      await runImport({ text: 'some recipe text' })

      expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_import_used')
    })

    it('always persists a single found recipe as a pending-review draft, returning its id (no more unsaved pass-through)', async () => {
      importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Soup' }) })

      const result = await runImport({ text: 'some recipe text' })

      expect(recipesService.createDraft).toHaveBeenCalledWith('user_1', expect.objectContaining({ title: 'Soup' }), { pendingReview: true, batchId: expect.any(String) })
      expect(result).toEqual(['a'])
    })

    it('persists multiple found recipes as pending-review drafts sharing one batchId', async () => {
      importService.importFromFile.mockResolvedValue([
        { title: 'Salad' },
        { title: 'Spring Rolls' },
        { title: 'Pho' },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Salad' }) })
        .mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Spring Rolls' }) })
        .mockResolvedValueOnce({ id: 'c', toObject: () => ({ id: 'c', title: 'Pho' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      const result = await runImport({}, { file })

      expect(recipesService.createDraft).toHaveBeenCalledTimes(3)
      expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
      expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
      expect(recipesService.createDraft.mock.calls[2][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('skips a malformed recipe in a multi-recipe batch but still persists the valid ones', async () => {
      importService.importFromFile.mockResolvedValue([
        {}, // no title -> fails validation
        { title: 'Spring Rolls' },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Spring Rolls' }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      const result = await runImport({}, { file })

      expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['b'])
    })

    it('throws BadRequestException without persisting anything when every recipe in a multi-recipe batch fails validation', async () => {
      importService.importFromFile.mockResolvedValue([{}, {}])
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      await expect(runImport({}, { file })).rejects.toThrow(BadRequestException)
      expect(recipesService.createDraft).not.toHaveBeenCalled()
    })

    it('links a single imported recipe\'s ingredient to an existing app recipe when a confident match is found', async () => {
      importService.importFromText.mockResolvedValue([
        { title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce' }] }] },
      ])
      recipesService.findLinkCandidates.mockResolvedValue([{ id: 'existing-1', title: 'Peanut Dipping Sauce' }])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToExistingId: 'existing-1' },
      ])
      recipesService.createDraft.mockResolvedValueOnce({ id: 'a', toObject: () => ({ id: 'a', title: 'Spring Rolls' }) })

      await runImport({ text: 'spring rolls recipe' })

      expect(importService.resolveLinks).toHaveBeenCalledWith(
        [{ title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'existing-1' }] }] }],
        [{ id: 'existing-1', title: 'Peanut Dipping Sauce' }],
      )
    })

    it('links a dish to its sauce within the same batch after both are created', async () => {
      importService.importFromFile.mockResolvedValue([
        { title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce' }] }] },
        { title: 'Dipping Sauce', ingredients: [{ items: [{ name: 'fish sauce' }] }] },
      ])
      importService.resolveLinks.mockResolvedValue([
        { recipeIndex: 0, groupIndex: 0, itemIndex: 0, linkToRecipeIndex: 1 },
      ])
      recipesService.createDraft
        .mockResolvedValueOnce({ id: 'rolls-id', toObject: () => ({ id: 'rolls-id', title: 'Spring Rolls' }) })
        .mockResolvedValueOnce({ id: 'sauce-id', toObject: () => ({ id: 'sauce-id', title: 'Dipping Sauce' }) })
      recipesService.updateDraft.mockResolvedValue({ toObject: () => ({ id: 'rolls-id', title: 'Spring Rolls', linked: true }) })
      const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

      const result = await runImport({}, { file })

      expect(recipesService.updateDraft).toHaveBeenCalledWith(
        'rolls-id',
        'user_1',
        false,
        expect.objectContaining({ ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'sauce-id' }] }] }),
      )
      expect(result).toEqual(['rolls-id', 'sauce-id'])
    })
  })
})
