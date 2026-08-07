import { ShareController } from './share.controller'

describe('ShareController', () => {
  const recipesService = { findBySlug: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  function makeRes() {
    return {
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    }
  }

  it('renders og tags for the recipe image, title, and description', async () => {
    recipesService.findBySlug.mockResolvedValue({
      title: 'Salted Cucumber Salad',
      description: 'A tangy summer salad.',
      descriptionEn: 'A tangy summer salad (en).',
      image: 'https://assets.tugy.dev/salted-cucumber.jpg',
    })
    const controller = new ShareController(recipesService as any)
    const res = makeRes()

    await controller.shareRecipe('salted-cucumber-salad', res as any)

    expect(res.type).toHaveBeenCalledWith('html')
    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:image" content="https://assets.tugy.dev/salted-cucumber.jpg"')
    expect(html).toContain('og:title" content="Salted Cucumber Salad"')
    expect(html).toContain('og:description" content="A tangy summer salad."')
    expect(html).toContain('https://recipes.tugy.dev/#/recipe/salted-cucumber-salad')
    expect(res.redirect).not.toHaveBeenCalled()
  })

  it('falls back to the default image when the recipe has none', async () => {
    recipesService.findBySlug.mockResolvedValue({ title: 'No Photo', description: '' })
    const controller = new ShareController(recipesService as any)
    const res = makeRes()

    await controller.shareRecipe('no-photo', res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).toContain('og:image" content="https://assets.tugy.dev/a-quick-date-and-honey-cake.jpg"')
  })

  it('escapes HTML in the title and description', async () => {
    recipesService.findBySlug.mockResolvedValue({
      title: '<script>alert(1)</script>',
      description: 'Uses "quotes" & <tags>',
      image: 'https://assets.tugy.dev/x.jpg',
    })
    const controller = new ShareController(recipesService as any)
    const res = makeRes()

    await controller.shareRecipe('xss-test', res as any)

    const html = res.send.mock.calls[0][0] as string
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('redirects straight to the app when the recipe does not exist', async () => {
    recipesService.findBySlug.mockResolvedValue(null)
    const controller = new ShareController(recipesService as any)
    const res = makeRes()

    await controller.shareRecipe('missing-recipe', res as any)

    expect(res.redirect).toHaveBeenCalledWith(302, 'https://recipes.tugy.dev/#/recipe/missing-recipe')
    expect(res.send).not.toHaveBeenCalled()
  })
})
