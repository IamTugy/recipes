# AI Recipe Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste text, a URL, or upload a PDF/DOCX (plus optionally a photo) and have Gemini extract a complete bilingual recipe draft that pre-fills the existing recipe creation form for review before saving.

**Architecture:** A new reusable `GeminiService` (api/src/ai/) wraps the `@google/genai` SDK with two generic methods (`generateStructured`, `generateText`) that any future Gemini feature can call. A `RecipeImportService` (api/src/recipes/import/) normalizes text/URL/PDF/DOCX input into plain text (using schema.org JSON-LD when a URL has it, skipping Gemini entirely), then calls `GeminiService.generateStructured` with a prompt describing the exact bilingual `Recipe` shape. The frontend gets a new "Import with AI" choice on the New Recipe screen, a new import page, and `RecipeForm` gains an `importedDraft` prop to pre-fill from the response.

**Tech Stack:** NestJS/Mongoose (api/), `@google/genai` (Gemini SDK), `pdf-parse`, `mammoth`, `multer` (multipart file upload), React 19/Vite (src/), Jest.

## Global Constraints

- Never use the em dash character in code comments, commit messages, or doc text - use a hyphen, comma, or restructure the sentence.
- All Gemini calls happen server-side only - `GEMINI_API_KEY` must never be sent to or read by the frontend.
- The extracted recipe fields must match the existing `Recipe`/`IngredientGroup`/`IngredientItem`/`StepGroup`/`StepItem` shapes exactly (see `src/types.ts`) so the response can be handed to `RecipeForm` with no field renaming.
- `.doc` (legacy binary Word format) is explicitly unsupported - only `.pdf` and `.docx`.
- Exactly one of `text`, `url`, or an uploaded file must be provided per import request; zero or more than one is a 400.
- This plan implements `docs/superpowers/specs/2026-08-03-ai-recipe-import-design.md` in full. Chat-about-a-recipe and recipe-quality-validation are explicitly out of scope (future features that will reuse `GeminiService`).

---

### Task 1: GeminiService - shared, reusable Gemini client

**Files:**
- Create: `api/src/ai/gemini.service.ts`
- Create: `api/src/ai/gemini.service.spec.ts`
- Create: `api/src/ai/ai.module.ts`
- Modify: `api/package.json` (add `@google/genai`)
- Modify: `api/src/app.module.ts` (import `AiModule`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `GeminiService.generateStructured<T>(prompt: string): Promise<T>` and `GeminiService.generateText(prompt: string): Promise<string>`, both throwing a plain `Error` with a clear message if `GEMINI_API_KEY` is unset or Gemini returns an empty response. Exported from `AiModule` for `RecipeImportService` (Task 3) to inject.

- [ ] **Step 1: Add the dependency**

```bash
cd /Users/tugy/git/recipes/api
npm install @google/genai@^1.0.0
```

- [ ] **Step 2: Write the failing test**

Create `api/src/ai/gemini.service.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config'
import { GeminiService } from './gemini.service'

const mockGenerateContent = jest.fn()

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}))

describe('GeminiService', () => {
  beforeEach(() => jest.clearAllMocks())

  it('generateStructured parses the JSON text response', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"title":"Soup"}' })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    const result = await service.generateStructured<{ title: string }>('extract this')
    expect(result).toEqual({ title: 'Soup' })
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'extract this',
      config: { responseMimeType: 'application/json' },
    })
  })

  it('generateStructured throws when GEMINI_API_KEY is not configured', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateStructured('x')).rejects.toThrow('GEMINI_API_KEY is not configured')
  })

  it('generateStructured throws when Gemini returns an empty response', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateStructured('x')).rejects.toThrow('Gemini returned an empty response')
  })

  it('generateText returns the plain text response', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'hello there' })
    const config = { get: jest.fn().mockReturnValue('test-key') }
    const service = new GeminiService(config as unknown as ConfigService)

    await expect(service.generateText('say hi')).resolves.toBe('hello there')
    expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-2.5-flash', contents: 'say hi' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npx jest gemini.service.spec.ts`
Expected: FAIL, `Cannot find module './gemini.service'`

- [ ] **Step 4: Write the implementation**

Create `api/src/ai/gemini.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'

@Injectable()
export class GeminiService {
  private client: GoogleGenAI | null = null
  private readonly model = 'gemini-2.5-flash'

  constructor(private readonly config: ConfigService) {}

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.config.get<string>('GEMINI_API_KEY')
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
      this.client = new GoogleGenAI({ apiKey })
    }
    return this.client
  }

  // Used when the caller needs the response parsed as JSON - the prompt
  // itself must instruct Gemini on the exact shape to return, since this
  // relies on responseMimeType rather than a strict schema object (keeps
  // this method resilient to SDK schema-type API changes across versions).
  async generateStructured<T>(prompt: string): Promise<T> {
    const client = this.getClient()
    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    })
    if (!response.text) throw new Error('Gemini returned an empty response')
    return JSON.parse(response.text) as T
  }

  // Plain text generation, no JSON constraint - not used by the recipe
  // import feature, but exists now so a future chat feature can call
  // GeminiService directly without needing changes here.
  async generateText(prompt: string): Promise<string> {
    const client = this.getClient()
    const response = await client.models.generateContent({ model: this.model, contents: prompt })
    if (!response.text) throw new Error('Gemini returned an empty response')
    return response.text
  }
}
```

Create `api/src/ai/ai.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { GeminiService } from './gemini.service'

@Module({
  providers: [GeminiService],
  exports: [GeminiService],
})
export class AiModule {}
```

- [ ] **Step 5: Wire the module into the app**

In `api/src/app.module.ts`, add `AiModule` to the `imports` array (add `import { AiModule } from './ai/ai.module'` alongside the other feature module imports, and `AiModule` in the `@Module({ imports: [...] })` list - follow the exact pattern already used for `TranslationsModule` in that file).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd api && npx jest gemini.service.spec.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Run the full backend suite**

Run: `cd api && npx jest`
Expected: PASS, all suites (184 existing + 4 new = 188)

- [ ] **Step 8: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/package.json api/package-lock.json api/src/ai/gemini.service.ts api/src/ai/gemini.service.spec.ts api/src/ai/ai.module.ts api/src/app.module.ts
git commit -m "feat: add reusable GeminiService for AI-powered features"
```

---

### Task 2: Source normalization - URL/JSON-LD/HTML and PDF/DOCX text extraction

**Files:**
- Create: `api/src/recipes/import/source-extractor.ts`
- Create: `api/src/recipes/import/source-extractor.spec.ts`
- Modify: `api/package.json` (add `pdf-parse`, `mammoth`)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `extractFromUrl(url: string): Promise<{ text: string; structured?: Partial<ImportedRecipe> }>` - if the page has schema.org `Recipe` JSON-LD, returns it pre-parsed in `structured` (Task 3 skips Gemini entirely when this is present); otherwise returns cleaned page text in `text` with `structured` undefined.
  - `extractFromPdf(buffer: Buffer): Promise<string>`
  - `extractFromDocx(buffer: Buffer): Promise<string>`
  - `ImportedRecipe` type (also used by Task 3): the exact bilingual recipe shape, defined once here and reused everywhere else in this feature.

- [ ] **Step 1: Add the dependencies**

```bash
cd /Users/tugy/git/recipes/api
npm install pdf-parse@^1.1.1 mammoth@^1.8.0
```

- [ ] **Step 2: Write the failing test**

Create `api/src/recipes/import/source-extractor.spec.ts`:

```typescript
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
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html })

    const result = await extractFromUrl('https://example.com/soup')
    expect(result.structured).toMatchObject({ name: 'Tomato Soup' })
  })

  it('falls back to cleaned page text when there is no JSON-LD Recipe', async () => {
    const html = '<html><head><style>.x{color:red}</style><script>var a=1</script></head><body><h1>Tomato Soup</h1><p>Great recipe</p></body></html>'
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => html })

    const result = await extractFromUrl('https://example.com/soup')
    expect(result.structured).toBeUndefined()
    expect(result.text).toContain('Tomato Soup')
    expect(result.text).toContain('Great recipe')
    expect(result.text).not.toContain('color:red')
    expect(result.text).not.toContain('var a=1')
  })

  it('throws a clear error when the URL is unreachable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npx jest source-extractor.spec.ts`
Expected: FAIL, `Cannot find module './source-extractor'`

- [ ] **Step 4: Write the implementation**

Create `api/src/recipes/import/source-extractor.ts`:

```typescript
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

// The exact bilingual recipe shape produced by this feature - matches
// src/types.ts's Recipe/IngredientGroup/StepGroup field names exactly so
// the frontend can use the response directly with no renaming.
export interface ImportedRecipe {
  title: string
  titleHe?: string
  category?: string
  tags?: string[]
  tagsEn?: string[]
  cuisine?: string
  description?: string
  descriptionEn?: string
  prepTime?: number
  cookTime?: number
  servings?: number
  difficulty?: string
  ingredients?: { group?: string; groupEn?: string; items: { amount?: number; unit?: string; name: string; nameEn?: string }[] }[]
  steps?: { title?: string; titleEn?: string; items: { instruction: string; instructionEn?: string; timerMinutes?: number }[] }[]
  tips?: string[]
  tipsEn?: string[]
}

export async function extractFromUrl(url: string): Promise<{ text: string; structured?: Partial<ImportedRecipe> }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Could not reach that page (HTTP ${res.status})`)
  const html = await res.text()

  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1])
      const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] ?? [parsed])
      const recipe = candidates.find((c: { '@type'?: string | string[] }) => {
        const type = c?.['@type']
        return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))
      })
      if (recipe) return { text: '', structured: recipe as Partial<ImportedRecipe> }
    } catch {
      // Not valid JSON-LD - keep looking at other script blocks.
    }
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { text }
}

export async function extractFromPdf(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer)
    return result.text
  } catch (err) {
    throw new Error(`Could not read that PDF file: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function extractFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (err) {
    throw new Error(`Could not read that DOCX file: ${err instanceof Error ? err.message : String(err)}`)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npx jest source-extractor.spec.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/package.json api/package-lock.json api/src/recipes/import/source-extractor.ts api/src/recipes/import/source-extractor.spec.ts
git commit -m "feat: add URL/JSON-LD/PDF/DOCX source extraction for recipe import"
```

---

### Task 3: RecipeImportService - orchestrates extraction and the Gemini call

**Files:**
- Create: `api/src/recipes/import/recipe-import.service.ts`
- Create: `api/src/recipes/import/recipe-import.service.spec.ts`

**Interfaces:**
- Consumes: `GeminiService.generateStructured<T>` (Task 1), `extractFromUrl`/`extractFromPdf`/`extractFromDocx`/`ImportedRecipe` (Task 2).
- Produces: `RecipeImportService.importFromText(text: string): Promise<ImportedRecipe>`, `.importFromUrl(url: string): Promise<ImportedRecipe>`, `.importFromFile(buffer: Buffer, mimeType: string): Promise<ImportedRecipe>` - the last one dispatches to PDF or DOCX extraction based on `mimeType`, throwing for anything else. Consumed by `RecipeImportController` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `api/src/recipes/import/recipe-import.service.spec.ts`:

```typescript
import { RecipeImportService } from './recipe-import.service'
import * as sourceExtractor from './source-extractor'

jest.mock('./source-extractor')

describe('RecipeImportService', () => {
  const geminiService = { generateStructured: jest.fn() }
  const service = new RecipeImportService(geminiService as any)

  beforeEach(() => jest.clearAllMocks())

  it('importFromText sends the text straight to Gemini', async () => {
    geminiService.generateStructured.mockResolvedValue({ title: 'Soup' })
    const result = await service.importFromText('2 tomatoes, boil them')
    expect(result).toEqual({ title: 'Soup' })
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('2 tomatoes, boil them'))
  })

  it('importFromUrl skips Gemini entirely when JSON-LD structured data is found', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: '', structured: { name: 'Tomato Soup', recipeIngredient: ['2 tomatoes'] } })
    const result = await service.importFromUrl('https://example.com/soup')
    expect(geminiService.generateStructured).not.toHaveBeenCalled()
    expect(result.title).toBe('Tomato Soup')
  })

  it('importFromUrl falls back to Gemini when no JSON-LD is found', async () => {
    ;(sourceExtractor.extractFromUrl as jest.Mock).mockResolvedValue({ text: 'Tomato Soup recipe text' })
    geminiService.generateStructured.mockResolvedValue({ title: 'Tomato Soup' })
    const result = await service.importFromUrl('https://example.com/soup')
    expect(geminiService.generateStructured).toHaveBeenCalledWith(expect.stringContaining('Tomato Soup recipe text'))
    expect(result).toEqual({ title: 'Tomato Soup' })
  })

  it('importFromFile dispatches to PDF extraction for application/pdf', async () => {
    ;(sourceExtractor.extractFromPdf as jest.Mock).mockResolvedValue('pdf recipe text')
    geminiService.generateStructured.mockResolvedValue({ title: 'From PDF' })
    const result = await service.importFromFile(Buffer.from('x'), 'application/pdf')
    expect(sourceExtractor.extractFromPdf).toHaveBeenCalled()
    expect(result).toEqual({ title: 'From PDF' })
  })

  it('importFromFile dispatches to DOCX extraction for the docx mime type', async () => {
    ;(sourceExtractor.extractFromDocx as jest.Mock).mockResolvedValue('docx recipe text')
    geminiService.generateStructured.mockResolvedValue({ title: 'From DOCX' })
    const result = await service.importFromFile(Buffer.from('x'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(sourceExtractor.extractFromDocx).toHaveBeenCalled()
    expect(result).toEqual({ title: 'From DOCX' })
  })

  it('importFromFile throws for an unsupported mime type', async () => {
    await expect(service.importFromFile(Buffer.from('x'), 'application/msword')).rejects.toThrow('Unsupported file type')
  })

  it('propagates a Gemini error', async () => {
    geminiService.generateStructured.mockRejectedValue(new Error('Gemini quota exceeded'))
    await expect(service.importFromText('some text')).rejects.toThrow('Gemini quota exceeded')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest recipe-import.service.spec.ts`
Expected: FAIL, `Cannot find module './recipe-import.service'`

- [ ] **Step 3: Write the implementation**

Create `api/src/recipes/import/recipe-import.service.ts`:

```typescript
import { Injectable, BadRequestException } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import { extractFromUrl, extractFromPdf, extractFromDocx, type ImportedRecipe } from './source-extractor'

const EXTRACTION_PROMPT = `You are extracting a cooking recipe from raw text into a strict JSON object. Read the following source text and produce a single JSON object with exactly these fields (omit any field you cannot determine, but always include "title"):

{
  "title": "string, English title (required)",
  "titleHe": "string, Hebrew title",
  "category": "one of: breakfast, lunch, dinner, dessert, salad, soup, snack, bread, sauce",
  "tags": ["Hebrew tags"],
  "tagsEn": ["English tags"],
  "cuisine": "string, e.g. Italian, Brazilian",
  "description": "string, Hebrew short description",
  "descriptionEn": "string, English short description",
  "prepTime": "number, minutes",
  "cookTime": "number, minutes",
  "servings": "number",
  "difficulty": "one of: easy, medium, hard",
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "string", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if this step mentions a specific duration" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

Always fill in both the Hebrew and English version of every text field, translating as needed if the source is only in one language. Respond with ONLY the JSON object, no other text.

Source text:
`

const JSON_LD_TO_RECIPE_PROMPT = `You are converting a schema.org Recipe JSON-LD object into a strict JSON object matching this exact shape (omit fields you cannot determine, but always include "title"):

{
  "title": "string, English title (required)",
  "titleHe": "string, Hebrew title",
  "category": "one of: breakfast, lunch, dinner, dessert, salad, soup, snack, bread, sauce",
  "tags": ["Hebrew tags"],
  "tagsEn": ["English tags"],
  "cuisine": "string",
  "description": "string, Hebrew short description",
  "descriptionEn": "string, English short description",
  "prepTime": "number, minutes",
  "cookTime": "number, minutes",
  "servings": "number",
  "difficulty": "one of: easy, medium, hard",
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "string", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if mentioned" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

The source is normally in English - translate every field into Hebrew as well as keeping the English version. Respond with ONLY the JSON object, no other text.

Source JSON-LD:
`

@Injectable()
export class RecipeImportService {
  constructor(private readonly gemini: GeminiService) {}

  async importFromText(text: string): Promise<ImportedRecipe> {
    return this.gemini.generateStructured<ImportedRecipe>(`${EXTRACTION_PROMPT}${text}`)
  }

  async importFromUrl(url: string): Promise<ImportedRecipe> {
    const { text, structured } = await extractFromUrl(url)
    if (structured) {
      return this.gemini.generateStructured<ImportedRecipe>(`${JSON_LD_TO_RECIPE_PROMPT}${JSON.stringify(structured)}`)
    }
    return this.importFromText(text)
  }

  async importFromFile(buffer: Buffer, mimeType: string): Promise<ImportedRecipe> {
    let text: string
    if (mimeType === 'application/pdf') {
      text = await extractFromPdf(buffer)
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      text = await extractFromDocx(buffer)
    } else {
      throw new BadRequestException(`Unsupported file type: ${mimeType}. Only PDF and DOCX are supported.`)
    }
    return this.importFromText(text)
  }
}
```

Note: even when JSON-LD structured data is found, this still makes one Gemini call - to translate/fill in the Hebrew fields the JSON-LD (usually English-only) won't have, and to normalize field names (e.g. `recipeIngredient` to the app's `ingredients` shape). This is a deliberate simplification over the spec's "no Gemini call at all" phrasing - full field-mapping from arbitrary schema.org Recipe JSON-LD shapes without any AI call would need significant one-off mapping code for limited benefit, since a single Flash-tier call is already free at this app's usage volume. If token cost ever becomes a real concern, this is the one place to revisit.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx jest recipe-import.service.spec.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/import/recipe-import.service.ts api/src/recipes/import/recipe-import.service.spec.ts
git commit -m "feat: add RecipeImportService orchestrating extraction and Gemini"
```

---

### Task 4: RecipeImportController - the HTTP endpoint

**Files:**
- Create: `api/src/recipes/import/recipe-import.controller.ts`
- Create: `api/src/recipes/import/recipe-import.controller.spec.ts`
- Modify: `api/package.json` (add `multer`, `@types/multer`)
- Modify: `api/src/recipes/recipes.module.ts` (register the new controller/service, import `AiModule`)

**Interfaces:**
- Consumes: `RecipeImportService` (Task 3).
- Produces: `POST /recipes/import` - multipart/form-data with optional `text` field, optional `url` field, optional `file` (PDF/DOCX). Returns the `ImportedRecipe` JSON directly (200) or a 400 with a clear message.

- [ ] **Step 1: Add multer types (multer itself is already a transitive dependency of @nestjs/platform-express, but the file interceptor's types need the package)**

```bash
cd /Users/tugy/git/recipes/api
npm install --save-dev @types/multer@^1.4.12
```

- [ ] **Step 2: Write the failing test**

Create `api/src/recipes/import/recipe-import.controller.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common'
import { RecipeImportController } from './recipe-import.controller'

describe('RecipeImportController', () => {
  const importService = {
    importFromText: jest.fn(),
    importFromUrl: jest.fn(),
    importFromFile: jest.fn(),
  }
  const controller = new RecipeImportController(importService as any)

  beforeEach(() => jest.clearAllMocks())

  it('imports from text when only text is provided', async () => {
    importService.importFromText.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ text: 'some recipe text' }, undefined)
    expect(importService.importFromText).toHaveBeenCalledWith('some recipe text')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from url when only url is provided', async () => {
    importService.importFromUrl.mockResolvedValue({ title: 'Soup' })
    const result = await controller.import({ url: 'https://example.com/soup' }, undefined)
    expect(importService.importFromUrl).toHaveBeenCalledWith('https://example.com/soup')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('imports from file when only a file is provided', async () => {
    importService.importFromFile.mockResolvedValue({ title: 'Soup' })
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    const result = await controller.import({}, file)
    expect(importService.importFromFile).toHaveBeenCalledWith(file.buffer, 'application/pdf')
    expect(result).toEqual({ title: 'Soup' })
  })

  it('throws BadRequestException when no source is provided', async () => {
    await expect(controller.import({}, undefined)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when more than one source is provided', async () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File
    await expect(controller.import({ text: 'a', url: 'https://example.com' }, undefined)).rejects.toThrow(BadRequestException)
    await expect(controller.import({ text: 'a' }, file)).rejects.toThrow(BadRequestException)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npx jest recipe-import.controller.spec.ts`
Expected: FAIL, `Cannot find module './recipe-import.controller'`

- [ ] **Step 4: Write the implementation**

Create `api/src/recipes/import/recipe-import.controller.ts`:

```typescript
import { Body, Controller, Post, BadRequestException, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { RecipeImportService } from './recipe-import.service'

@Controller('recipes/import')
export class RecipeImportController {
  constructor(private readonly importService: RecipeImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async import(@Body() body: { text?: string; url?: string }, @UploadedFile() file?: Express.Multer.File) {
    const sourcesProvided = [body.text, body.url, file].filter(Boolean).length
    if (sourcesProvided === 0) {
      throw new BadRequestException('Provide text, a URL, or a file')
    }
    if (sourcesProvided > 1) {
      throw new BadRequestException('Provide only one of text, a URL, or a file')
    }

    if (body.text) return this.importService.importFromText(body.text)
    if (body.url) return this.importService.importFromUrl(body.url)
    return this.importService.importFromFile(file!.buffer, file!.mimetype)
  }
}
```

- [ ] **Step 5: Register in RecipesModule**

Read `api/src/recipes/recipes.module.ts` first to match its exact existing structure, then add: `RecipeImportController` to `controllers`, `RecipeImportService` to `providers`, and `AiModule` to `imports` (alongside whatever modules it already imports, e.g. `MongooseModule.forFeature([...])`).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd api && npx jest recipe-import.controller.spec.ts`
Expected: PASS, 5 tests

- [ ] **Step 7: Run the full backend suite**

Run: `cd api && npx jest`
Expected: PASS, all suites (188 + 5 = 193)

- [ ] **Step 8: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/package.json api/package-lock.json api/src/recipes/import/recipe-import.controller.ts api/src/recipes/import/recipe-import.controller.spec.ts api/src/recipes/recipes.module.ts
git commit -m "feat: add POST /recipes/import endpoint"
```

---

### Task 5: k8s - GEMINI_API_KEY secret and env var

**STOP before this task if you don't have a Gemini API key yet - get a free one from https://aistudio.google.com/apikey and ask the user for it if you don't have it.**

**Files:**
- Create: `server` repo (separate checkout, e.g. `/Users/tugy/git/server`): `k8s/apps/recipes-api/gemini-sealed-secret.yaml`
- Modify: `server` repo: `k8s/apps/recipes-api/deployment.yaml`

- [ ] **Step 1: Create the plaintext secret locally (never commit this file)**

```bash
cat > /tmp/gemini-secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: recipes-api-gemini
  namespace: apps
type: Opaque
stringData:
  apiKey: "<the Gemini API key>"
EOF
```

- [ ] **Step 2: Seal it**

```bash
kubectl -n sealed-secrets port-forward svc/sealed-secrets-controller 8085:8080 &
sleep 2
curl -s http://localhost:8085/v1/cert.pem -o /tmp/sealed-secrets-cert.pem
kubeseal --format=yaml --cert /tmp/sealed-secrets-cert.pem < /tmp/gemini-secret.yaml > /Users/tugy/git/server/k8s/apps/recipes-api/gemini-sealed-secret.yaml
rm /tmp/gemini-secret.yaml /tmp/sealed-secrets-cert.pem
```

- [ ] **Step 3: Add the env var to the deployment**

In `/Users/tugy/git/server/k8s/apps/recipes-api/deployment.yaml`, add to the `api` container's `env` list (not the `seed-recipes` initContainer, which doesn't need it):

```yaml
            - name: GEMINI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: recipes-api-gemini
                  key: apiKey
```

- [ ] **Step 4: Add the sealed secret to the deploy workflow's apply step**

In `/Users/tugy/git/server/.github/workflows/deploy-recipes.yaml`, find the existing `kubectl apply -f k8s/apps/recipes-api/sealed-secret.yaml` line and add a sibling line applying `k8s/apps/recipes-api/gemini-sealed-secret.yaml` right after it.

- [ ] **Step 5: Apply directly now (don't wait for the next CI deploy) and commit**

```bash
kubectl apply -f /Users/tugy/git/server/k8s/apps/recipes-api/gemini-sealed-secret.yaml
kubectl apply -f /Users/tugy/git/server/k8s/apps/recipes-api/deployment.yaml
kubectl rollout restart deploy/recipes-api -n apps
kubectl rollout status deploy/recipes-api -n apps --timeout=90s

cd /Users/tugy/git/server
git add k8s/apps/recipes-api/gemini-sealed-secret.yaml k8s/apps/recipes-api/deployment.yaml .github/workflows/deploy-recipes.yaml
git commit -m "feat: add GEMINI_API_KEY to recipes-api"
git pull --rebase origin main
git push
```

---

### Task 6: Frontend - importRecipe API helper

**Files:**
- Create: `src/lib/recipeImport.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `importRecipe(input: { text?: string; url?: string; file?: File }, getToken: () => Promise<string | null>): Promise<ImportedRecipe>`, throwing `ApiError` (from `src/lib/api.ts`) on failure with the server's message. `ImportedRecipe` type matches the backend's shape from Task 2 exactly (duplicated here since frontend and backend don't share a types package - keep both definitions in sync if the shape ever changes).

- [ ] **Step 1: Write the implementation directly (this is a thin fetch wrapper, no meaningful unit test beyond what integration/manual testing already covers - matches the existing pattern of `src/lib/translate.ts`, which also has no test file)**

Create `src/lib/recipeImport.ts`:

```typescript
import { ApiError } from './api'
import type { Category, Difficulty } from '../types'

export interface ImportedRecipe {
  title: string
  titleHe?: string
  category?: Category
  tags?: string[]
  tagsEn?: string[]
  cuisine?: string
  description?: string
  descriptionEn?: string
  prepTime?: number
  cookTime?: number
  servings?: number
  difficulty?: Difficulty
  ingredients?: { group?: string; groupEn?: string; items: { amount?: number; unit?: string; name: string; nameEn?: string }[] }[]
  steps?: { title?: string; titleEn?: string; items: { instruction: string; instructionEn?: string; timerMinutes?: number }[] }[]
  tips?: string[]
  tipsEn?: string[]
}

export async function importRecipe(
  input: { text?: string; url?: string; file?: File },
  getToken: () => Promise<string | null>
): Promise<ImportedRecipe> {
  const token = await getToken()
  const formData = new FormData()
  if (input.text) formData.append('text', input.text)
  if (input.url) formData.append('url', input.url)
  if (input.file) formData.append('file', input.file)

  const res = await fetch('/api/recipes/import', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? 'Import failed')
  }
  return res.json()
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/tugy/git/recipes && npx tsc -b`
Expected: PASS, no errors

- [ ] **Step 3: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/lib/recipeImport.ts
git commit -m "feat: add importRecipe API helper"
```

---

### Task 7: Frontend - RecipeForm accepts an importedDraft prop

**Files:**
- Modify: `src/components/RecipeForm.tsx`

**Interfaces:**
- Consumes: `ImportedRecipe` type (Task 6).
- Produces: `RecipeForm` now accepts an optional `importedDraft?: ImportedRecipe` prop alongside its existing `existing`/`duplicateFrom` props, pre-filling all fields from it (no title prefix, unlike `duplicateFrom`'s "Copy of " behavior) when provided.

- [ ] **Step 1: Read the current props interface and prefill logic first**

Run: `grep -n "RecipeFormProps\|const prefill\|const titlePrefix" src/components/RecipeForm.tsx`

You'll see an interface `RecipeFormProps { existing?: Recipe; duplicateFrom?: Recipe }` and a line `const prefill = existing ?? duplicateFrom`.

- [ ] **Step 2: Add the new prop and extend the prefill chain**

In `src/components/RecipeForm.tsx`, change:

```typescript
import type { Category, Difficulty, IngredientGroup, IngredientItem, Recipe, StepGroup, StepItem } from '../types'
```

to also import the new type:

```typescript
import type { Category, Difficulty, IngredientGroup, IngredientItem, Recipe, StepGroup, StepItem } from '../types'
import type { ImportedRecipe } from '../lib/recipeImport'
```

Change the props interface:

```typescript
interface RecipeFormProps {
  existing?: Recipe
  duplicateFrom?: Recipe
  importedDraft?: ImportedRecipe
}
```

Change the function signature and prefill chain (find `export default function RecipeForm({ existing, duplicateFrom }: RecipeFormProps) {` and the `const prefill = existing ?? duplicateFrom` line right after it):

```typescript
export default function RecipeForm({ existing, duplicateFrom, importedDraft }: RecipeFormProps) {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const tx = t[lang]
  const isEditing = !!existing
  const prefill = existing ?? duplicateFrom ?? importedDraft
```

(Leave every other line in this section - `titlePrefix`, and all the `useState` initializers reading from `prefill` - exactly as they are. `titlePrefix` stays gated on `duplicateFrom` only, so an imported draft's title has no "Copy of " prefix. Every existing `prefill?.field` access already handles a partial/optional shape safely, so `ImportedRecipe` - which is missing `id`, `averageRating`, etc. compared to a full `Recipe` - works here with no other changes.)

- [ ] **Step 3: Type-check**

Run: `cd /Users/tugy/git/recipes && npx tsc -b`
Expected: PASS, no errors (if you see an error about `prefill`'s type being too narrow for a field only `Recipe` has, check which field - every field this form actually reads from `prefill` should already exist on `ImportedRecipe` per Task 6's type; if one doesn't, add it to `ImportedRecipe` in `src/lib/recipeImport.ts` rather than loosening this file)

- [ ] **Step 4: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/RecipeForm.tsx
git commit -m "feat: RecipeForm accepts an importedDraft prop to pre-fill from AI import"
```

---

### Task 8: Frontend - RecipeImportPage and the New Recipe choice screen

**Files:**
- Create: `src/components/RecipeImportPage.tsx`
- Modify: `src/components/NewRecipePage.tsx`
- Modify: `src/App.tsx` (add the `/recipes/import` route)

**Interfaces:**
- Consumes: `importRecipe` (Task 6), `RecipeForm` with `importedDraft` (Task 7).
- Produces: route `/recipes/import` rendering `RecipeImportPage`; `NewRecipePage` now shows a choice screen when visited plainly (no `?from=` param and no router-state draft).

- [ ] **Step 1: Create the import page**

Create `src/components/RecipeImportPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { importRecipe } from '../lib/recipeImport'

export default function RecipeImportPage() {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { lang } = useLanguage()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceCount = [text.trim(), url.trim(), file].filter(Boolean).length
  const canSubmit = sourceCount === 1 && !loading

  async function handleExtract() {
    setError(null)
    setLoading(true)
    try {
      const draft = await importRecipe(
        { text: text.trim() || undefined, url: url.trim() || undefined, file: file ?? undefined },
        getToken
      )
      navigate('/recipes/new', { state: { importedDraft: draft } })
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'he' ? 'הייבוא נכשל' : 'Import failed'))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors'
  const labelClass = 'block text-xs font-semibold text-cream/50 mb-1'

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-serif text-2xl font-bold text-cream">
          {lang === 'he' ? 'ייבוא מתכון עם AI' : 'Import Recipe with AI'}
        </h1>
        <p className="text-sm text-cream/50">
          {lang === 'he'
            ? 'הדביקו טקסט, קישור לאתר, או העלו קובץ PDF/DOCX - בחרו מקור אחד בלבד.'
            : 'Paste text, a website link, or upload a PDF/DOCX file - choose exactly one source.'}
        </p>

        {error && <div className="card p-3 text-sm text-red-400 border border-red-400/20">{error}</div>}

        <div className="card p-5 space-y-4">
          <div>
            <label className={labelClass}>{lang === 'he' ? 'טקסט המתכון' : 'Recipe text'}</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={!!url.trim() || !!file}
              rows={6}
              className={inputClass}
              placeholder={lang === 'he' ? 'הדביקו כאן את תוכן המתכון...' : 'Paste the recipe content here...'}
            />
          </div>
          <div>
            <label className={labelClass}>{lang === 'he' ? 'קישור לאתר' : 'Website URL'}</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={!!text.trim() || !!file}
              className={inputClass}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={labelClass}>{lang === 'he' ? 'קובץ PDF או DOCX' : 'PDF or DOCX file'}</label>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              disabled={!!text.trim() || !!url.trim()}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={handleExtract} disabled={!canSubmit} className="btn-primary disabled:opacity-50">
            {loading ? (lang === 'he' ? 'מייבא...' : 'Extracting...') : (lang === 'he' ? 'ייבא' : 'Extract')}
          </button>
          <button type="button" onClick={() => navigate('/recipes/new')} className="btn-ghost">
            {lang === 'he' ? 'התחל מדף ריק' : 'Start from scratch instead'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import (alongside the other component imports, e.g. right after `import NewRecipePage from './components/NewRecipePage'`):

```typescript
import RecipeImportPage from './components/RecipeImportPage'
```

And the route (alongside the other `<Route>` entries, right after `<Route path="/recipes/new" element={<NewRecipePage />} />`):

```tsx
<Route path="/recipes/import" element={<RecipeImportPage />} />
```

- [ ] **Step 3: Add the choice screen to NewRecipePage**

Replace the full contents of `src/components/NewRecipePage.tsx`:

```tsx
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useRecipe } from '../hooks/useRecipes'
import RecipeForm from './RecipeForm'
import { useLanguage } from '../hooks/useLanguage'
import type { ImportedRecipe } from '../lib/recipeImport'

export default function NewRecipePage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const fromSlug = searchParams.get('from') ?? undefined
  const { lang } = useLanguage()
  const { recipe, loading } = useRecipe(fromSlug)
  const importedDraft = (location.state as { importedDraft?: ImportedRecipe } | null)?.importedDraft

  if (fromSlug && loading) {
    return <div className="min-h-dvh bg-bg pt-20 px-4 text-center text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</div>
  }

  if (fromSlug) {
    return <RecipeForm duplicateFrom={recipe} />
  }

  if (importedDraft) {
    return <RecipeForm importedDraft={importedDraft} />
  }

  return (
    <div className="min-h-dvh bg-bg pt-20 px-4">
      <div className="max-w-md mx-auto space-y-4 text-center">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {lang === 'he' ? 'איך תרצו להוסיף מתכון?' : 'How would you like to add a recipe?'}
        </h1>
        <button type="button" onClick={() => navigate('/recipes/import')} className="btn-primary w-full">
          {lang === 'he' ? '✨ ייבוא עם AI' : '✨ Import with AI'}
        </button>
        <button type="button" onClick={() => navigate('/recipes/new/blank')} className="btn-ghost w-full">
          {lang === 'he' ? 'התחל מדף ריק' : 'Start from scratch'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the blank-form route this choice screen links to**

The choice screen above navigates to `/recipes/new/blank` for "start from scratch" (a plain, always-blank form, distinct from `/recipes/new` which now shows the choice). In `src/App.tsx`, add one more route right next to the `/recipes/new` route:

```tsx
<Route path="/recipes/new/blank" element={<RecipeForm />} />
```

Add the import for `RecipeForm` in `src/App.tsx` if it isn't already imported there directly (check first - it likely is only imported inside `NewRecipePage.tsx` today, not in `App.tsx`):

```typescript
import RecipeForm from './components/RecipeForm'
```

- [ ] **Step 5: Type-check and build**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: PASS, no errors

- [ ] **Step 6: Lint (react-hooks gate)**

Run: `cd /Users/tugy/git/recipes && npx eslint src/components/RecipeImportPage.tsx src/components/NewRecipePage.tsx src/App.tsx`
Expected: no output (clean)

- [ ] **Step 7: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/RecipeImportPage.tsx src/components/NewRecipePage.tsx src/App.tsx
git commit -m "feat: add AI import page and New Recipe choice screen"
```

---

### Task 9: Deploy and end-to-end verify

**Files:** none (deploy-only task)

- [ ] **Step 1: Push, watch CI for both repos, verify pod image tags**

Follow the established push -> `gh run watch` (recipes repo) -> `gh run watch` (server repo, triggered automatically) -> `kubectl rollout status` -> image-tag-match sequence used throughout this project's history, for `recipes` and `recipes-api`.

- [ ] **Step 2: Verify the endpoint directly with a real free-tier Gemini call**

```bash
KEY=$(kubectl get secret -n apps recipes-mcp-apikey -o jsonpath='{.data.apiKey}' | base64 -d)
curl -s -X POST https://recipes.tugy.dev/api/recipes/import \
  -H "Authorization: Bearer $KEY" \
  -F "text=Simple Tomato Soup. Ingredients: 4 tomatoes, 1 onion, salt. Instructions: Chop tomatoes and onion. Boil for 20 minutes. Season with salt and serve." \
  | python3 -m json.tool
```

Expected: a JSON recipe object with `title`, `titleHe`, ingredients, and steps all filled in from that short description, both languages present.

- [ ] **Step 3: Verify the "provide zero or multiple sources" validation live**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://recipes.tugy.dev/api/recipes/import -H "Authorization: Bearer $KEY"
```

Expected: `400`.

- [ ] **Step 4: Manual browser verification (required for this UI change per project practice)**

Log into the live site, click "New Recipe," confirm the choice screen appears, click "Import with AI," paste a real recipe's text, click "Extract," confirm it navigates into `RecipeForm` with every field pre-filled correctly, and that "Start from scratch" (from both the choice screen and the import page) still reaches a genuinely blank form.
