import { UploadsController } from './uploads.controller'

describe('UploadsController', () => {
  it('POST /uploads/presign returns a presigned upload URL and the resulting public URL', async () => {
    const uploadsService = {
      presignPhotoUpload: jest.fn().mockResolvedValue({
        uploadUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
      }),
    }
    const controller = new UploadsController(uploadsService as any)

    const result = await controller.presign({ recipeSlug: 'a', contentType: 'image/jpeg' })

    expect(uploadsService.presignPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg', undefined)
    expect(result).toEqual({
      uploadUrl: 'https://r2.example.com/signed',
      publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
    })
  })

  it('passes the purpose through when provided', async () => {
    const uploadsService = { presignPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: 'u', publicUrl: 'p' }) }
    const controller = new UploadsController(uploadsService as any)

    await controller.presign({ recipeSlug: 'a', contentType: 'image/jpeg', purpose: 'recipe' })

    expect(uploadsService.presignPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg', 'recipe')
  })
})
