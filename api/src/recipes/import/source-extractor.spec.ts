import { extractFromUrl, extractFromPdf, extractFromDocx } from './source-extractor'

describe('extractFromUrl', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns structured data when the page has schema.org Recipe JSON-LD', async () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Tomato Soup',
      recipeIngredient: ['2 tomatoes', '1 onion'],
    })}</script></head><body>ignored</body></html>`
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html }) as unknown as typeof fetch

    const result = await extractFromUrl('https://example.com/soup')
    expect(result.structured).toMatchObject({ name: 'Tomato Soup' })
  })

  it('falls back to cleaned page text when there is no JSON-LD Recipe', async () => {
    const html = '<html><head><style>.x{color:red}</style><script>var a=1</script></head><body><h1>Tomato Soup</h1><p>Great recipe</p></body></html>'
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html }) as unknown as typeof fetch

    const result = await extractFromUrl('https://example.com/soup')
    expect(result.structured).toBeUndefined()
    expect(result.text).toContain('Tomato Soup')
    expect(result.text).toContain('Great recipe')
    expect(result.text).not.toContain('color:red')
    expect(result.text).not.toContain('var a=1')
  })

  it('throws a clear error when the URL is unreachable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    await expect(extractFromUrl('https://example.com/missing')).rejects.toThrow('Could not reach')
  })
})

describe('extractFromPdf', () => {
  it('throws a clear error when the PDF cannot be parsed', async () => {
    await expect(extractFromPdf(Buffer.from('not a real pdf'))).rejects.toThrow('Could not read')
  })
})

describe('extractFromDocx', () => {
  it('throws a clear error when the DOCX cannot be parsed', async () => {
    await expect(extractFromDocx(Buffer.from('not a real docx'))).rejects.toThrow('Could not read')
  })
})
