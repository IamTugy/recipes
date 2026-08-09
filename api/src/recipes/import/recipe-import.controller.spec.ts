import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'

describe('RecipeImportController', () => {
  const importService = {
    importFromText: jest.fn(),
    importFromUrl: jest.fn(),
    importFromFile: jest.fn(),
  }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeImportController(importService as unknown as RecipeImportService, activityLog as any)

  beforeEach(() => jest.clearAllMocks())

  it('imports from text when only text is provided', async () => {
    importService.importFromText.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)
    expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from url when only url is provided', async () => {
    importService.importFromUrl.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ url: 'https://example.com/soup' }, { userId: 'user_1' } as any, undefined)
    expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from file when only a file is provided', async () => {
    importService.importFromFile.mockResolvedValue({ title: 'Soup' })
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    const result = await controller.import({}, { userId: 'user_1' } as any, file)
    expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('throws BadRequestException when no source is provided', async () => {
    await expect(controller.import({}, { userId: 'user_1' } as any, undefined)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when more than one source is provided', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    await expect(controller.import({ text: 'a', url: 'https://example.com' }, { userId: 'user_1' } as any, undefined)).rejects.toThrow(BadRequestException)
    await expect(controller.import({ text: 'a' }, { userId: 'user_1' } as any, file)).rejects.toThrow(BadRequestException)
  })

  it('logs an ai_recipe_import_used event after a successful import', async () => {
    importService.importFromText.mockResolvedValue({ title: 'Soup' })
    await controller.import({ text: 'some recipe text' }, { userId: 'user_1' } as any, undefined)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_import_used')
  })
})
