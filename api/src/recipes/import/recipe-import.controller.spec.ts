import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'
import { RecipesService } from '../recipes.service'

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
  const controller = new RecipeImportController(
    importService as unknown as RecipeImportService,
    recipesService as unknown as RecipesService,
    activityLog as any,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    recipesService.findLinkCandidates.mockResolvedValue([])
    importService.resolveLinks.mockResolvedValue([])
  })

  it('imports from text when only text is provided', async () => {
    importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
    const result = await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)
    expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from url when only url is provided', async () => {
    importService.importFromUrl.mockResolvedValue([{ title: 'Soup' }])
    const result = await controller.import({ url: 'https://example.com/soup' }, { userId: 'user_1' } as any, undefined)
    expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup', undefined)
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from url with the caption text combined when a social share provides both', async () => {
    importService.importFromUrl.mockResolvedValue([{ title: 'Soup' }])
    const result = await controller.import(
      { url: 'https://www.instagram.com/reel/abc', text: 'Best soup ever, recipe below' },
      { userId: 'user_1' } as any,
      undefined,
    )
    expect(importService.importFromUrl).toHaveBeenCalledWith('https://www.instagram.com/reel/abc', 'Best soup ever, recipe below')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from file when only a file is provided', async () => {
    importService.importFromFile.mockResolvedValue([{ title: 'Soup' }])
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    const result = await controller.import({}, { userId: 'user_1' } as any, { file: [file] })
    expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf', undefined)
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from file with the prompt text combined when both are provided', async () => {
    importService.importFromFile.mockResolvedValue([{ title: 'Soup' }])
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    const result = await controller.import({ text: 'make it vegan' }, { userId: 'user_1' } as any, { file: [file] })
    expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf', 'make it vegan')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from a photo when only an image is provided', async () => {
    importService.importFromImage.mockResolvedValue([{ title: 'Soup' }])
    const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File
    const result = await controller.import({}, { userId: 'user_1' } as any, { image: [image] })
    expect(importService.importFromImage).toHaveBeenCalledWith(image.buffer, 'image/jpeg', undefined)
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from a photo with the prompt text combined when both are provided', async () => {
    importService.importFromImage.mockResolvedValue([{ title: 'Soup' }])
    const image = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as Express.Multer.File
    const result = await controller.import({ text: 'make it vegan' }, { userId: 'user_1' } as any, { image: [image] })
    expect(importService.importFromImage).toHaveBeenCalledWith(image.buffer, 'image/jpeg', 'make it vegan')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('throws BadRequestException when no source is provided', async () => {
    await expect(controller.import({}, { userId: 'user_1' } as any, undefined)).rejects.toThrow(BadRequestException)
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

  it('logs an ai_recipe_import_used event after a successful import', async () => {
    importService.importFromText.mockResolvedValue([{ title: 'Soup' }])
    await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_import_used')
  })

  it('persists multiple found recipes as pending-review drafts sharing one batchId, instead of returning them directly', async () => {
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

    const result = await controller.import({}, { userId: 'user_1' } as any, { file: [file] })

    expect(recipesService.createDraft).toHaveBeenCalledTimes(3)
    expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
    expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
    expect(recipesService.createDraft.mock.calls[2][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
    expect(result).toEqual([{ id: 'a', title: 'Salad' }, { id: 'b', title: 'Spring Rolls' }, { id: 'c', title: 'Pho' }])
  })

  it('skips a malformed recipe in a multi-recipe batch but still persists the valid ones', async () => {
    importService.importFromFile.mockResolvedValue([
      {}, // no title -> fails validation
      { title: 'Spring Rolls' },
    ])
    recipesService.createDraft.mockResolvedValueOnce({ id: 'b', toObject: () => ({ id: 'b', title: 'Spring Rolls' }) })
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

    const result = await controller.import({}, { userId: 'user_1' } as any, { file: [file] })

    expect(recipesService.createDraft).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: 'b', title: 'Spring Rolls' }])
  })

  it('throws BadRequestException without persisting anything when every recipe in a multi-recipe batch fails validation', async () => {
    importService.importFromFile.mockResolvedValue([{}, {}])
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File

    await expect(controller.import({}, { userId: 'user_1' } as any, { file: [file] })).rejects.toThrow(BadRequestException)
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

    const result = await controller.import({ text: 'spring rolls recipe' }, { userId: 'user_1' } as any, undefined)

    expect(importService.resolveLinks).toHaveBeenCalledWith(
      [{ title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'existing-1' }] }] }],
      [{ id: 'existing-1', title: 'Peanut Dipping Sauce' }],
    )
    expect(result).toEqual({ title: 'Spring Rolls', ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'existing-1' }] }] })
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

    const result = await controller.import({}, { userId: 'user_1' } as any, { file: [file] })

    expect(recipesService.updateDraft).toHaveBeenCalledWith(
      'rolls-id',
      'user_1',
      false,
      expect.objectContaining({ ingredients: [{ items: [{ name: 'dipping sauce', linkedRecipeId: 'sauce-id' }] }] }),
    )
    expect(result).toEqual([
      { id: 'rolls-id', title: 'Spring Rolls', linked: true },
      { id: 'sauce-id', title: 'Dipping Sauce' },
    ])
  })
})
