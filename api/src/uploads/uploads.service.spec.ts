import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { UploadsService } from './uploads.service'

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://r2.example.com/signed-put-url'),
}))

describe('UploadsService', () => {
  async function makeService() {
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
      providers: [UploadsService, { provide: ConfigService, useValue: config }],
    }).compile()
    return moduleRef.get(UploadsService)
  }

  it('returns a signed upload URL and a public URL under reviews/<slug>/ for the recipe', async () => {
    const service = await makeService()
    const result = await service.presignReviewPhotoUpload('tomato-soup', 'image/jpeg')

    expect(result.uploadUrl).toBe('https://r2.example.com/signed-put-url')
    expect(result.publicUrl).toMatch(/^https:\/\/recipes-assets\.tugy\.dev\/reviews\/tomato-soup\/[^/]+\.jpg$/)
  })

  it('maps content types to the correct file extension', async () => {
    const service = await makeService()
    const png = await service.presignReviewPhotoUpload('tomato-soup', 'image/png')
    const webp = await service.presignReviewPhotoUpload('tomato-soup', 'image/webp')

    expect(png.publicUrl).toMatch(/\.png$/)
    expect(webp.publicUrl).toMatch(/\.webp$/)
  })
})
