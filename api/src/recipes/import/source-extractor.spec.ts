import { extractFromUrl, extractFromPdf, extractFromDocx, isSocialMediaUrl, extractTikTokOembed } from './source-extractor'

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

describe('isSocialMediaUrl', () => {
  it('recognizes Instagram, Facebook, and TikTok links including subdomains and share shortlinks', () => {
    expect(isSocialMediaUrl('https://www.instagram.com/reel/abc123')).toBe(true)
    expect(isSocialMediaUrl('https://m.facebook.com/story.php?id=1')).toBe(true)
    expect(isSocialMediaUrl('https://fb.watch/abc123')).toBe(true)
    expect(isSocialMediaUrl('https://vm.tiktok.com/ZMabc123')).toBe(true)
    expect(isSocialMediaUrl('https://www.tiktok.com/@chef/video/123')).toBe(true)
  })

  it('returns false for regular recipe sites and invalid urls', () => {
    expect(isSocialMediaUrl('https://www.seriouseats.com/tomato-soup')).toBe(false)
    expect(isSocialMediaUrl('not a url')).toBe(false)
  })
})

describe('extractTikTokOembed', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns the title and author from the oEmbed response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Tomato soup recipe', author_name: 'chef' }),
    }) as unknown as typeof fetch
    const result = await extractTikTokOembed('https://www.tiktok.com/@chef/video/123')
    expect(result).toBe('Tomato soup recipe. By chef')
  })

  it('returns null when the request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    const result = await extractTikTokOembed('https://www.tiktok.com/@chef/video/123')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch
    const result = await extractTikTokOembed('https://www.tiktok.com/@chef/video/123')
    expect(result).toBeNull()
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
