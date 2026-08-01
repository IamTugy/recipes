import { TranslationsController } from './translations.controller'

describe('TranslationsController', () => {
  const translationsService = { translate: jest.fn() }

  it('POST /translations translates the given text to the target language', async () => {
    translationsService.translate.mockResolvedValue('hello')
    const controller = new TranslationsController(translationsService as any)
    const result = await controller.translate({ text: 'שלום', targetLang: 'en' })
    expect(translationsService.translate).toHaveBeenCalledWith('שלום', 'en')
    expect(result).toEqual({ translated: 'hello' })
  })
})
