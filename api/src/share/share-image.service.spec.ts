import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { ShareImageService } from './share-image.service'
import { RedisService } from '../redis/redis.service'

const resizeMock = jest.fn().mockReturnThis()
const rotateMock = jest.fn().mockReturnThis()
const jpegMock = jest.fn().mockReturnThis()
const toBufferMock = jest.fn()

jest.mock('sharp', () => jest.fn(() => ({
  rotate: rotateMock,
  resize: resizeMock,
  jpeg: jpegMock,
  toBuffer: toBufferMock,
})))

describe('ShareImageService', () => {
  const getBuffer = jest.fn()
  const set = jest.fn()
  const redisService = { getClient: () => ({ getBuffer, set }) }

  beforeEach(() => {
    jest.clearAllMocks()
    getBuffer.mockResolvedValue(null)
    set.mockResolvedValue('OK')
    toBufferMock.mockResolvedValue(Buffer.from('resized-jpeg-bytes'))
  })

  async function makeService() {
    const config = { get: jest.fn(() => 'https://recipes-assets.tugy.dev') }
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShareImageService,
        { provide: ConfigService, useValue: config },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile()
    return moduleRef.get(ShareImageService)
  }

  describe('isAllowedSource', () => {
    it('allows URLs under the configured R2 public URL', async () => {
      const service = await makeService()
      expect(service.isAllowedSource('https://recipes-assets.tugy.dev/recipes/x/photo.jpg')).toBe(true)
    })

    it('rejects URLs on any other host', async () => {
      const service = await makeService()
      expect(service.isAllowedSource('https://evil.example.com/steal.jpg')).toBe(false)
    })
  })

  describe('getResized', () => {
    const sourceUrl = 'https://recipes-assets.tugy.dev/recipes/x/photo.jpg'

    it('returns the cached buffer without fetching or resizing on a cache hit', async () => {
      getBuffer.mockResolvedValue(Buffer.from('cached-bytes'))
      const fetchSpy = jest.spyOn(global, 'fetch')
      const service = await makeService()

      await expect(service.getResized(sourceUrl)).resolves.toEqual(Buffer.from('cached-bytes'))
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(toBufferMock).not.toHaveBeenCalled()
    })

    it('fetches, resizes to a capped width, and caches the result on a cache miss', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array(Buffer.from('original-bytes')).buffer,
      } as Response)
      const service = await makeService()

      const result = await service.getResized(sourceUrl)

      expect(result).toEqual(Buffer.from('resized-jpeg-bytes'))
      expect(resizeMock).toHaveBeenCalledWith({ width: 1200, withoutEnlargement: true })
      expect(jpegMock).toHaveBeenCalledWith({ quality: 82 })
      expect(set).toHaveBeenCalledWith(expect.any(String), Buffer.from('resized-jpeg-bytes'), 'EX', 60 * 60 * 24 * 30)
    })

    it('resizes to the requested width when one is given', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array(Buffer.from('original-bytes')).buffer,
      } as Response)
      const service = await makeService()

      await service.getResized(sourceUrl, 160)

      expect(resizeMock).toHaveBeenCalledWith({ width: 160, withoutEnlargement: true })
    })

    it('caches different widths for the same source under different keys', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array(Buffer.from('original-bytes')).buffer,
      } as Response)
      const service = await makeService()

      await service.getResized(sourceUrl, 160)
      await service.getResized(sourceUrl, 320)

      expect(set.mock.calls[0][0]).not.toBe(set.mock.calls[1][0])
    })

    it('throws when the source image cannot be fetched', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response)
      const service = await makeService()

      await expect(service.getResized(sourceUrl)).rejects.toThrow('Could not fetch the source image')
    })
  })
})
