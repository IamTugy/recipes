import { ShareController } from './share.controller'

describe('ShareController', () => {
  const recipesService = { findById: jest.fn(), listRevisions: jest.fn() }
  // Mirrors the real ShareImageService: only recipes-assets.tugy.dev (our
  // R2 bucket) is "allowed" to be proxied/resized - the assets.tugy.dev
  // fixtures used below stay on the raw encodeURI path, so those
  // assertions don't need to know about the resize proxy at all.
  const shareImageService = {
    isAllowedSource: jest.fn((url: string) => url.startsWith('https://recipes-assets.tugy.dev/')),
    getResized: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  function makeRes() {
    return {
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
      set: jest.fn().mockReturnThis(),
    }
  }

  function makeController() {
    return new ShareController(recipesService as any, shareImageService as any)
  }

  it('renders og tags for the recipe image, title, and description', async () => {
    recipesService.findById.mockResolvedValue({
      title: 'Salted Cucumber Salad',
      description: 'A tangy summer salad.',
      descriptionEn: 'A tangy summer salad (en).',
      image: 'https://assets.tugy.dev/salted-cucumber.jpg',
    })
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', undefined, res as any)

    expect(res.type).toHaveBeenCalledWith('html')
    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:image" content="https://assets.tugy.dev/salted-cucumber.jpg"')
    expect(html).toContain('og:title" content="Salted Cucumber Salad"')
    expect(html).toContain('og:description" content="A tangy summer salad."')
    expect(html).toContain('og:url" content="https://recipes.tugy.dev/#/recipes/6a75d719acabc64c19daa913"')
    expect(res.redirect).not.toHaveBeenCalled()
    expect(recipesService.listRevisions).not.toHaveBeenCalled()
  })

  it('routes a recipe photo hosted on our own R2 bucket through the resize proxy', async () => {
    recipesService.findById.mockResolvedValue({
      title: 'Pão de Queijo',
      description: '',
      image: 'https://recipes-assets.tugy.dev/recipes/pao-de-queijo/photo.jpg',
    })
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', undefined, res as any)

    const html = res.send.mock.calls[0][0] as string
    const expectedSrc = encodeURIComponent('https://recipes-assets.tugy.dev/recipes/pao-de-queijo/photo.jpg')
    expect(html).toContain(`og:image" content="https://recipes.tugy.dev/share/image?src=${expectedSrc}"`)
  })

  it('redirects browsers through the app root (?share=...), not straight to the recipe hash route', async () => {
    // location.replace() straight to the recipe collapses this page and the
    // recipe into one history entry with nothing to back into - landing on
    // Home first (a real navigation) gives the back button somewhere to go.
    recipesService.findById.mockResolvedValue({
      title: 'Salted Cucumber Salad',
      description: 'A tangy summer salad.',
      image: 'https://assets.tugy.dev/salted-cucumber.jpg',
    })
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', undefined, res as any)

    const html = res.send.mock.calls[0][0] as string
    const redirectUrl = 'https://recipes.tugy.dev/?share=%2Frecipes%2F6a75d719acabc64c19daa913'
    expect(html).toContain(`http-equiv="refresh" content="0; url=${redirectUrl}"`)
    expect(html).toContain(`location.replace("${redirectUrl}")`)
  })

  it('carries the revision through the ?share= redirect target too', async () => {
    recipesService.findById.mockResolvedValue({ title: 'Live Title', description: '', image: 'https://assets.tugy.dev/live.jpg' })
    recipesService.listRevisions.mockResolvedValue([
      { id: 'rev-1', snapshot: { title: 'Old Published Title', image: 'https://assets.tugy.dev/old.jpg' } },
    ])
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', 'rev-1', res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('location.replace("https://recipes.tugy.dev/?share=%2Frecipes%2F6a75d719acabc64c19daa913%3Frev%3Drev-1")')
  })

  it('falls back to the default image when the recipe has none', async () => {
    recipesService.findById.mockResolvedValue({ title: 'No Photo', description: '' })
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', undefined, res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:image" content="https://assets.tugy.dev/a-quick-date-and-honey-cake.jpg"')
  })

  it('percent-encodes non-ASCII characters in the image URL', async () => {
    recipesService.findById.mockResolvedValue({
      title: 'Pão de Queijo',
      description: '',
      image: 'https://assets.tugy.dev/recipes/pão-de-queijo-2/photo.jpg',
    })
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a705d89e6154da67cc9f3c6', undefined, res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:image" content="https://assets.tugy.dev/recipes/p%C3%A3o-de-queijo-2/photo.jpg"')
  })

  it('escapes HTML in the title and description', async () => {
    recipesService.findById.mockResolvedValue({
      title: '<script>alert(1)</script>',
      description: 'Uses "quotes" & <tags>',
      image: 'https://assets.tugy.dev/x.jpg',
    })
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', undefined, res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('redirects straight to the app when the recipe does not exist (never published, or bad id)', async () => {
    recipesService.findById.mockResolvedValue(null)
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('missing-recipe', undefined, res as any)

    expect(res.redirect).toHaveBeenCalledWith(302, 'https://recipes.tugy.dev/')
    expect(res.send).not.toHaveBeenCalled()
  })

  it('uses a specific published revision\'s snapshot when ?rev is given', async () => {
    recipesService.findById.mockResolvedValue({
      title: 'Live Title',
      description: 'Live description',
      image: 'https://assets.tugy.dev/live.jpg',
    })
    recipesService.listRevisions.mockResolvedValue([
      { id: 'rev-2', snapshot: { title: 'Newer draft title', image: 'https://assets.tugy.dev/newer.jpg' } },
      { id: 'rev-1', snapshot: { title: 'Old Published Title', description: 'Old description', image: 'https://assets.tugy.dev/old.jpg' } },
    ])
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', 'rev-1', res as any)

    expect(recipesService.listRevisions).toHaveBeenCalledWith('6a75d719acabc64c19daa913', false)
    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:title" content="Old Published Title"')
    expect(html).toContain('og:image" content="https://assets.tugy.dev/old.jpg"')
    expect(html).toContain('https://recipes.tugy.dev/#/recipes/6a75d719acabc64c19daa913?rev=rev-1')
  })

  it('falls back to the live recipe when the requested revision id does not match any published revision', async () => {
    recipesService.findById.mockResolvedValue({ title: 'Live Title', description: '', image: 'https://assets.tugy.dev/live.jpg' })
    recipesService.listRevisions.mockResolvedValue([])
    const controller = makeController()
    const res = makeRes()

    await controller.shareRecipe('6a75d719acabc64c19daa913', 'not-a-real-revision', res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:title" content="Live Title"')
  })

  describe('shareImage', () => {
    const FALLBACK_IMAGE = 'https://assets.tugy.dev/a-quick-date-and-honey-cake.jpg'

    it('serves the resized image bytes with a long-lived cache header', async () => {
      const buffer = Buffer.from('fake-jpeg-bytes')
      shareImageService.getResized.mockResolvedValue(buffer)
      const controller = makeController()
      const res = makeRes()

      await controller.shareImage('https://recipes-assets.tugy.dev/recipes/x/photo.jpg', res as any)

      expect(shareImageService.getResized).toHaveBeenCalledWith('https://recipes-assets.tugy.dev/recipes/x/photo.jpg')
      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=2592000, immutable')
      expect(res.type).toHaveBeenCalledWith('image/jpeg')
      expect(res.send).toHaveBeenCalledWith(buffer)
    })

    it('redirects to the fallback image when src is missing', async () => {
      const controller = makeController()
      const res = makeRes()

      await controller.shareImage(undefined, res as any)

      expect(res.redirect).toHaveBeenCalledWith(302, FALLBACK_IMAGE)
      expect(shareImageService.getResized).not.toHaveBeenCalled()
    })

    it('redirects to the fallback image when src is not an allowed host (SSRF guard)', async () => {
      const controller = makeController()
      const res = makeRes()

      await controller.shareImage('https://evil.example.com/steal.jpg', res as any)

      expect(res.redirect).toHaveBeenCalledWith(302, FALLBACK_IMAGE)
      expect(shareImageService.getResized).not.toHaveBeenCalled()
    })

    it('redirects to the fallback image when resizing fails', async () => {
      shareImageService.getResized.mockRejectedValue(new Error('boom'))
      const controller = makeController()
      const res = makeRes()

      await controller.shareImage('https://recipes-assets.tugy.dev/recipes/x/photo.jpg', res as any)

      expect(res.redirect).toHaveBeenCalledWith(302, FALLBACK_IMAGE)
    })
  })
})
