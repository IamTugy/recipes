import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'
import { RecipeImportService } from './recipe-import.service'

describe('RecipeImportController', () => {
  const importService = {
    importFromText: jest.fn(),
    importFromUrl: jest.fn(),
    importFromFile: jest.fn(),
  }
  const controller = new RecipeImportController(importService as unknown as RecipeImportService)

  beforeEach(() => jest.clearAllMocks())

  it('imports from text when only text is provided', async () => {
    importService.importFromText.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ text: 'some recipe text' }, undefined)
    expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from url when only url is provided', async () => {
    importService.importFromUrl.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ url: 'https://example.com/soup' }, undefined)
    expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from file when only a file is provided', async () => {
    importService.importFromFile.mockResolvedValue({ title: 'Soup' })
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    const result = await controller.import({}, file)
    expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('throws BadRequestException when no source is provided', async () => {
    await expect(controller.import({}, undefined)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when more than one source is provided', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    await expect(controller.import({ text: 'a', url: 'https://example.com' }, undefined)).rejects.toThrow(BadRequestException)
    await expect(controller.import({ text: 'a' }, file)).rejects.toThrow(BadRequestException)
  })
})
