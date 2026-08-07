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

    const result = await controller.presign({ recipeId: 'a', contentType: 'image/jpeg' })

    expect(uploadsService.presignPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg', undefined)
    expect(result).toEqual({
      uploadUrl: 'https://r2.example.com/signed',
      publicUrl: 'https://recipes-assets.tugy.dev/reviews/a/photo.jpg',
    })
  })

  it('passes the purpose through when provided', async () => {
    const uploadsService = { presignPhotoUpload: jest.fn().mockResolvedValue({ uploadUrl: 'u', publicUrl: 'p' }) }
    const controller = new UploadsController(uploadsService as any)

    await controller.presign({ recipeId: 'a', contentType: 'image/jpeg', purpose: 'recipe' })

    expect(uploadsService.presignPhotoUpload).toHaveBeenCalledWith('a', 'image/jpeg', 'recipe')
  })

  it('POST /uploads/enhance-photo delegates to the service and returns the new public URL', async () => {
    const uploadsService = {
      enhancePhoto: jest.fn().mockResolvedValue({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' }),
    }
    const controller = new UploadsController(uploadsService as any)

    const result = await controller.enhancePhoto({ recipeId: 'a', imageUrl: 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg' })

    expect(uploadsService.enhancePhoto).toHaveBeenCalledWith('a', 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg', undefined)
    expect(result).toEqual({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' })
  })

  it('POST /uploads/enhance-photo passes custom instructions through to the service', async () => {
    const uploadsService = {
      enhancePhoto: jest.fn().mockResolvedValue({ publicUrl: 'https://recipes-assets.tugy.dev/recipes/a/enhanced.png' }),
    }
    const controller = new UploadsController(uploadsService as any)

    await controller.enhancePhoto({
      recipeId: 'a',
      imageUrl: 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg',
      instructions: 'Show it outdoors in natural sunlight',
    })

    expect(uploadsService.enhancePhoto).toHaveBeenCalledWith(
      'a', 'https://recipes-assets.tugy.dev/recipes/a/photo.jpg', 'Show it outdoors in natural sunlight',
    )
  })
})
