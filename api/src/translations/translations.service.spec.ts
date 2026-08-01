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

  it('returns empty string without hitting cache or API for blank input', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const service = await makeService()

    await expect(service.translate('   ', 'he')).resolves.toBe('')
    expect(get).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
