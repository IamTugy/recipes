import { UploadsController } from './uploads.controller'

describe('UploadsController', () => {
  it('POST /uploads/presign returns a presigned upload URL and the resulting public URL', async () => {
    const uploadsService = {
      presignReviewPhotoUpload: jest.fn().mockResolvedValue({
        uploadUrl: 'https://r2.example.com/signed',
        publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
      }),
    }
    const controller = new UploadsController(uploadsService as any)

    const result = await controller.presign({ recipeSlug: 'a', contentType: 'image/jpeg' })

    expect(uploadsService.presignReviewPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg')
    expect(result).toEqual({
      uploadUrl: 'https://r2.example.com/signed',
      publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
    })
  })
})
