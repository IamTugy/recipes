import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { UploadsService } from './uploads.service'
import { GeminiService } from '../ai/gemini.service'

const mockS3Send = jest.fn().mockResolvedValue({})

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.example.com/signed-put-url'),
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation(input => input),
}))

describe('UploadsService', () => {
  async function makeService(gemini: Partial<GeminiService> = {}) {
    const config = {
      get: jest.fn((key: string) => ({
        R2_BUCKET: 'recipes-assets',
        R2_PUBLIC_URL: 'https://recipes-assets.tugy.dev',
        R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
      })[key]),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: ConfigService, useValue: config },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile()
    return moduleRef.get(UploadsService)
  }

  it('returns a signed upload URL and a public URL under reviews/<slug>/ by default', async () => {
    const service = await makeService()
    const result = await service.presignPhotoUpload('tomato-soup', 'image/jpeg')

    expect(result.uploadUrl).toBe('https://r2.example.com/signed-put-url')
    expect(result.publicUrl).toMatch(/^https:\/\/recipes-assets\.tugy\.dev\/reviews\/tomato-soup\/[^/]+\.jpg$/)
  })

  it('uses the recipes/<slug>/ folder when purpose is "recipe"', async () => {
    const service = await makeService()
    const result = await service.presignPhotoUpload('tomato-soup', 'image/jpeg', 'recipe')

    expect(result.publicUrl).toMatch(/^https:\/\/recipes-assets\.tugy\.dev\/recipes\/tomato-soup\/[^/]+\.jpg$/)
  })

  it('maps content types to the correct file extension', async () => {
    const service = await makeService()
    const png = await service.presignPhotoUpload('tomato-soup', 'image/png')
    const webp = await service.presignPhotoUpload('tomato-soup', 'image/webp')

    expect(png.publicUrl).toMatch(/\.png$/)
    expect(webp.publicUrl).toMatch(/\.webp$/)
  })

  describe('enhancePhoto', () => {
    const imageUrl = 'https://recipes-assets.tugy.dev/recipes/tomato-soup/original.jpg'

    beforeEach(() => {
      mockS3Send.mockClear()
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new Uint8Array(Buffer.from('source-bytes')).buffer,
      }) as unknown as typeof fetch
    })

    it('fetches the source image, sends it to Gemini, and uploads the result', async () => {
      const editImage = jest.fn().mockResolvedValue({ data: Buffer.from('enhanced-bytes').toString('base64'), mimeType: 'image/png' })
      const service = await makeService({ editImage })

      const result = await service.enhancePhoto('tomato-soup', imageUrl)

      expect(global.fetch).toHaveBeenCalledWith(imageUrl)
      expect(editImage).toHaveBeenCalledWith(Buffer.from('source-bytes').toString('base64'), 'image/jpeg', expect.any(String))
      expect(mockS3Send).toHaveBeenCalledTimes(1)
      expect(result.publicUrl).toMatch(/^https:\/\/recipes-assets\.tugy\.dev\/recipes\/tomato-soup\/[^/]+\.png$/)
    })

    it('rejects image URLs outside of our own bucket', async () => {
      const editImage = jest.fn()
      const service = await makeService({ editImage })

      await expect(service.enhancePhoto('tomato-soup', 'https://evil.example.com/steal.jpg')).rejects.toThrow('imageUrl must point to an uploaded photo')
      expect(editImage).not.toHaveBeenCalled()
    })

    it('throws when the source image cannot be fetched', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
      const service = await makeService({ editImage: jest.fn() })

      await expect(service.enhancePhoto('tomato-soup', imageUrl)).rejects.toThrow('Could not fetch the source image')
    })
  })
})
