import { Test } from '@nestjs/testing'
import { TranslationsService } from './translations.service'
import { RedisService } from '../redis/redis.service'

describe('TranslationsService', () => {
  const get = jest.fn()
  const set = jest.fn()
  const redisService = { getClient: () => ({ get, set }) }

  beforeEach(() => {
    jest.clearAllMocks()
    get.mockResolvedValue(null)
    set.mockResolvedValue('OK')
  })

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [TranslationsService, { provide: RedisService, useValue: redisService }],
    }).compile()
    return moduleRef.get(TranslationsService)
  }

  it('returns a cached translation without calling the translation API', async () => {
    get.mockResolvedValue('cached translation')
    const fetchSpy = jest.spyOn(global, 'fetch')
    const service = await makeService()

    await expect(service.translate('שלום', 'en')).resolves.toBe('cached translation')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches, caches, and returns a translation on a cache miss', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [[['hello', 'שלום', null, null, 1]], null, 'iw'],
    } as Response)
    const service = await makeService()

    await expect(service.translate('שלום', 'en')).resolves.toBe('hello')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('tl=en'),
      expect.any(Object),
    )
    expect(set).toHaveBeenCalledWith(expect.stringContaining('translation:en:'), 'hello', 'EX', expect.any(Number))
  })

  it('falls back to the original text when the translation API fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    const service = await makeService()

    await expect(service.translate('שלום', 'en')).resolves.toBe('שלום')
    expect(set).not.toHaveBeenCalled()
  })

  it('splits long text into chunks under the length cap, translates each, and joins the results instead of truncating', async () => {
    const longText = `${'מילה '.repeat(120)}תפוח` // well over 500 chars
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => ({
      ok: true,
      json: async () => [[[(url as string).includes('%D7%AA%D7%A4%D7%95%D7%97') ? 'apple' : 'word', 'x', null, null, 1]], null, 'iw'],
    } as Response))
    const service = await makeService()

    const result = await service.translate(longText, 'en')

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1)
    expect(result).toContain('apple')
    expect(result.endsWith('apple')).toBe(true)
  })

  it('falls back to the original text if any chunk fails to translate, rather than returning a partial result', async () => {
    const longText = `${'מילה '.repeat(120)}תפוח`
    let call = 0
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      call += 1
      if (call === 1) return { ok: false, status: 500 } as Response
      return { ok: true, json: async () => [[['word', 'x', null, null, 1]], null, 'iw'] } as Response
    })
    const service = await makeService()

    await expect(service.translate(longText, 'en')).resolves.toBe(longText.trim())
    expect(set).not.toHaveBeenCalled()
  })

  it('returns empty string without hitting cache or API for blank input', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const service = await makeService()

    await expect(service.translate('   ', 'he')).resolves.toBe('')
    expect(get).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
