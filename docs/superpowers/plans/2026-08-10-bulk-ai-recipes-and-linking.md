# Bulk AI Recipe Creation & Recipe Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user generate several recipes from one AI request, review/edit them one at a time via a persistent "drafts in progress" panel that survives refresh, and let any recipe reference another recipe as a linked ingredient with save/delete/publish rules that keep links consistent.

**Architecture:** Phase A (Tasks 1-7) makes bulk-generated AI recipes persist immediately as ordinary `draft`-status `Recipe` documents tagged `pendingReview`/`batchId`, with a small panel surfacing them across sessions/devices. Phase B (Tasks 8-13) adds a `linkedRecipeId` field to ingredient items plus three server-side guards (unresolvable link, circular link, delete/publish blocked by a link) and the picker UI.

**Tech Stack:** NestJS + Mongoose (`api/`), React + Vite (`src/`), Jest, existing Gemini AI service, Clerk auth.

## Global Constraints

- Bulk-generated drafts are ordinary `Recipe` documents (`status: 'draft'`) from the moment they're generated - no separate draft-only collection.
- A bulk draft is only ever removed by explicit user delete - never auto-expired.
- **Layout note (deliberate deviation from a literal "sidebar"):** `RecipeForm`'s editor is a single centered column (`max-w-3xl mx-auto`), same as every other page this session. Building a true side-by-side column would mean restructuring that layout and would collide with the app's existing collapsible nav `Sidebar.tsx` on mobile. This plan implements the "drafts in progress" panel as a horizontal strip/list docked above the form instead - same list/navigate/remove behavior the spec asks for, without a page-layout rewrite. Flag this to the user after Task 7 in case they want a true side panel instead.
- Linking reuses already-fetched client data (`useMyRecipes()`/`useRecipes()`) for the picker - no new search endpoint.
- A linked ingredient always resolves to whatever `/recipes/:id` already resolves to for the current viewer (existing per-viewer revision logic in `RecipesService.findByIdForUser`/`findById`) - no new resolution logic, no revision pinning.
- `IngredientItemDto.name` becomes optional; validity is "name present OR linkedRecipeId present," enforced with `class-validator`'s `@ValidateIf`, not a full custom decorator (simpler, sufficient for this DTO).

---

## Phase A - Bulk generation + persistent drafts panel

### Task 1: `pendingReview`/`batchId` fields on Recipe

**Files:**
- Modify: `api/src/recipes/schemas/recipe.schema.ts`
- Modify: `src/types.ts`
- Test: `api/src/recipes/schemas/recipe.schema.spec.ts` (create if it doesn't exist - check first)

**Interfaces:**
- Produces: `Recipe.pendingReview?: boolean` and `Recipe.batchId?: string` on both the Mongoose schema and the frontend `Recipe` type - every later task in Phase A reads/writes these two fields by exactly these names.

- [ ] **Step 1: Check for an existing schema spec file**

Run: `ls api/src/recipes/schemas/recipe.schema.spec.ts`

If it exists, read it first and follow its existing style for the new test. If it doesn't exist, you're creating it fresh in Step 2.

- [ ] **Step 2: Write the failing test**

Add to `api/src/recipes/schemas/recipe.schema.spec.ts` (create the file with this content if it doesn't already exist; if it exists, add this `it` block inside the existing `describe('Recipe schema', ...)`):

```ts
import { model, Types } from 'mongoose'
import { Recipe, RecipeSchema } from './recipe.schema'

describe('Recipe schema', () => {
  it('defaults pendingReview to false and allows batchId to be unset', () => {
    const RecipeModel = model(`Recipe_${Date.now()}`, RecipeSchema)
    const _id = new Types.ObjectId()
    const doc = new RecipeModel({ _id, slug: 'test-recipe', title: 'Test' })

    expect(doc.pendingReview).toBe(false)
    expect(doc.batchId).toBeUndefined()
  })

  it('stores pendingReview=true and a batchId when set', () => {
    const RecipeModel = model(`Recipe_${Date.now()}`, RecipeSchema)
    const _id = new Types.ObjectId()
    const doc = new RecipeModel({ _id, slug: 'test-recipe', title: 'Test', pendingReview: true, batchId: 'batch-1' })

    expect(doc.pendingReview).toBe(true)
    expect(doc.batchId).toBe('batch-1')
  })
})
```

(If the file already exists with an `id`-virtual test like the one in `recipe.schema.spec.ts` from an earlier session, keep that test - just add these two `it` blocks alongside it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest recipes/schemas/recipe.schema.spec.ts`
Expected: FAIL - `pendingReview`/`batchId` don't exist on the schema yet.

- [ ] **Step 3: Add the schema fields**

In `api/src/recipes/schemas/recipe.schema.ts`, add after the `deletedAt` prop (end of the class, before `export const RecipeSchema = ...`):

```ts
  // True from the moment a bulk-AI-generated draft is created until the
  // user does a real edit-and-save on it in the editor - drives the
  // "drafts in progress" panel, independent of `status`. An ordinary
  // manually-created draft never sets this at all (stays false).
  @Prop({ default: false })
  pendingReview?: boolean

  // Shared by every recipe produced from one bulk-generate call, so the
  // panel can group/order a batch and it survives a page refresh.
  @Prop()
  batchId?: string
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx jest recipes/schemas/recipe.schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Add the frontend type fields**

In `src/types.ts`, inside the `Recipe` interface (after `qualityReview?: QualityReview` or wherever the status-workflow fields are grouped), add:

```ts
  pendingReview?: boolean
  batchId?: string
```

- [ ] **Step 6: Verify frontend build**

Run: `npm run build`
Expected: PASS (no consumers yet, just a type addition).

- [ ] **Step 7: Commit**

```bash
git add api/src/recipes/schemas/recipe.schema.ts api/src/recipes/schemas/recipe.schema.spec.ts src/types.ts
git commit -m "feat: add pendingReview/batchId fields for bulk AI draft tracking"
```

---

### Task 2: `createDraft` accepts bulk options, `updateDraft` clears `pendingReview`

**Files:**
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `Recipe.pendingReview`/`batchId` from Task 1.
- Produces: `RecipesService.createDraft(userId: string, dto: SaveRecipeDraftDto, opts?: { pendingReview?: boolean; batchId?: string }): Promise<RecipeDocument>` - Task 5 (the AI-generate controller) calls this with `{ pendingReview: true, batchId }`. `updateDraft` now always sets `pendingReview: false` in its `$set`.

- [ ] **Step 1: Write the failing tests**

Add to `api/src/recipes/recipes.service.spec.ts`, near the existing `createDraft`/`updateDraft` tests:

```ts
  it('createDraft sets pendingReview and batchId when opts are provided', async () => {
    const exists = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(false) })
    const create = jest.fn().mockResolvedValue({ id: 'new-recipe', title: 'Soup' })
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', { title: 'Soup' } as any, { pendingReview: true, batchId: 'batch-1' })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ pendingReview: true, batchId: 'batch-1' }))
  })

  it('createDraft defaults pendingReview to false when opts are omitted', async () => {
    const exists = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(false) })
    const create = jest.fn().mockResolvedValue({ id: 'new-recipe', title: 'Soup' })
    const service = await makeService({ exists, create }, { create: jest.fn().mockResolvedValue({}) })
    await service.createDraft('user_1', { title: 'Soup' } as any)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ pendingReview: false, batchId: undefined }))
  })

  it('updateDraft clears pendingReview on every save', async () => {
    const existing = { slug: 'tomato-soup', ownerId: 'user_1', status: 'draft', pendingReview: true }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) })
    const updated = { id: 'tomato-soup', slug: 'tomato-soup', currentRevision: 2, pendingReview: false }
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })
    const service = await makeService({ findOne, findOneAndUpdate }, { create: jest.fn().mockResolvedValue({}) })
    await service.updateDraft('tomato-soup', 'user_1', false, { title: 'Tomato Soup' } as any)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'tomato-soup' },
      expect.objectContaining({ $set: expect.objectContaining({ pendingReview: false }) }),
      { new: true },
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "pendingReview"`
Expected: FAIL - `createDraft` doesn't accept an `opts` param yet, `updateDraft` doesn't set `pendingReview`.

- [ ] **Step 3: Update the service**

In `api/src/recipes/recipes.service.ts`, change `createDraft`:

```ts
  async createDraft(
    userId: string,
    dto: SaveRecipeDraftDto,
    opts: { pendingReview?: boolean; batchId?: string } = {},
  ): Promise<RecipeDocument> {
    const slug = await this.generateUniqueSlug(dto.title)
    const recipe = await this.recipeModel.create({
      ...dto, sources: dedupeSources(dto.sources), slug, ownerId: userId, status: 'draft', currentRevision: 1,
      pendingReview: opts.pendingReview ?? false, batchId: opts.batchId,
    })
    await this.saveNewRevision(recipe, userId)
    await this.activityLogService.record(userId, recipe.id, 'recipe_created')
    return recipe
  }
```

In `updateDraft`, add `pendingReview: false` to the `$set` object:

```ts
    const update: Record<string, unknown> = {
      $set: { ...dto, sources: dedupeSources(dto.sources), ...aiLock, pendingReview: false, ...(wasRejected ? { status: 'draft' } : {}) },
      $inc: { currentRevision: 1 },
    }
```

(This is the only change to `updateDraft` in this task - the rest of the method stays as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: createDraft accepts bulk pendingReview/batchId opts, updateDraft clears pendingReview"
```

---

### Task 3: `GET /recipes/pending` endpoint

**Files:**
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`
- Modify: `api/src/recipes/recipes.controller.ts`
- Modify: `api/src/recipes/recipes.controller.spec.ts`

**Interfaces:**
- Consumes: `Recipe.pendingReview`/`batchId` from Task 1.
- Produces: `RecipesService.findPending(userId: string): Promise<Record<string, unknown>[]>`, route `GET /recipes/pending` - Task 6's frontend hook calls this exact path.

- [ ] **Step 1: Write the failing service test**

Add to `api/src/recipes/recipes.service.spec.ts`:

```ts
  it('findPending returns the caller\'s pending-review recipes ordered by batch then creation time', async () => {
    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ toObject: () => ({ id: 'a', title: 'Soup', pendingReview: true }) }]),
    })
    const service = await makeService({ find })
    const result = await service.findPending('user_1')

    expect(find).toHaveBeenCalledWith({ ownerId: 'user_1', pendingReview: true, deletedAt: { $exists: false } })
    expect(result).toEqual([{ id: 'a', title: 'Soup', pendingReview: true }])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "findPending"`
Expected: FAIL - `findPending` doesn't exist.

- [ ] **Step 3: Add the service method**

In `api/src/recipes/recipes.service.ts`, add near `findMine`:

```ts
  // Bulk-AI drafts the user hasn't reviewed/saved yet - the "drafts in
  // progress" panel's data source. Ordered by batch so one bulk-generate
  // call's recipes stay grouped, then by creation order within a batch.
  async findPending(userId: string) {
    const recipes = await this.recipeModel
      .find({ ownerId: userId, pendingReview: true, deletedAt: { $exists: false } })
      .sort({ batchId: 1, createdAt: 1 })
      .exec()
    return recipes.map(r => r.toObject())
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "findPending"`
Expected: PASS

- [ ] **Step 5: Write the failing controller test**

Add to `api/src/recipes/recipes.controller.spec.ts`, add `findPending: jest.fn()` to the `recipesService` mock object at the top of the file, then add a test near the `findMine` test:

```ts
  it('GET /recipes/pending returns the requester\'s pending-review recipes', async () => {
    recipesService.findPending.mockResolvedValue([{ id: 'a', title: 'Soup' }])
    const controller = makeController()
    const result = await controller.findPending({ userId: 'user_1' } as any)
    expect(recipesService.findPending).toHaveBeenCalledWith('user_1')
    expect(result).toEqual([{ id: 'a', title: 'Soup' }])
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd api && npx jest recipes/recipes.controller.spec.ts -t "pending"`
Expected: FAIL - `controller.findPending` doesn't exist.

- [ ] **Step 7: Add the controller route**

In `api/src/recipes/recipes.controller.ts`, add a new route **immediately after `@Get('mine')`'s method** (must be before `@Get(':id')` so `/recipes/pending` isn't swallowed by the `:id` wildcard):

```ts
  @Get('pending')
  async findPending(@Req() req: Request & { userId: string }) {
    return this.recipesService.findPending(req.userId)
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd api && npx jest recipes/recipes.controller.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 9: Commit**

```bash
git add api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts \
        api/src/recipes/recipes.controller.ts api/src/recipes/recipes.controller.spec.ts
git commit -m "feat: add GET /recipes/pending endpoint for the drafts-in-progress panel"
```

---

### Task 4: `RecipeAiGenerateService.generate` splits one request into several recipes

**Files:**
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.service.ts`
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.service.spec.ts`

**Interfaces:**
- Consumes: `GeminiService.generateStructured<T>(prompt: string): Promise<T>`, `GeminiService.generateWithSearch(prompt: string): Promise<{ text: string; sources: {...}[] }>` (both already exist, unchanged).
- Produces: `RecipeAiGenerateService.generate(query: string): Promise<AiGeneratedRecipe[]>` (was `Promise<AiGeneratedRecipe>` - **breaking signature change**, always an array now, even for a single recipe). Task 5's controller consumes this array.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `api/src/recipes/ai-generate/recipe-ai-generate.service.spec.ts` with:

```ts
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeAiGenerateService', () => {
  const geminiService = { generateWithSearch: jest.fn(), generateStructured: jest.fn() }
  const service = new RecipeAiGenerateService(geminiService as unknown as GeminiService)

  beforeEach(() => jest.clearAllMocks())

  it('splits a request into one recipe when it names one recipe, then researches and structures it', async () => {
    geminiService.generateStructured
      .mockResolvedValueOnce({ recipes: ['best tomato soup'] })
      .mockResolvedValueOnce({ title: 'Tomato Soup' })
    geminiService.generateWithSearch.mockResolvedValue({
      text: 'Tomato soup: boil tomatoes...',
      sources: [{ title: 'Best Tomato Soup', url: 'https://example.com/soup' }],
    })

    const result = await service.generate('best tomato soup')

    expect(geminiService.generateStructured).toHaveBeenNthCalledWith(1, expect.stringContaining('best tomato soup'))
    expect(geminiService.generateWithSearch).toHaveBeenCalledWith(expect.stringContaining('best tomato soup'))
    expect(geminiService.generateStructured).toHaveBeenNthCalledWith(2, expect.stringContaining('Tomato soup: boil tomatoes...'))
    expect(result).toEqual([{
      title: 'Tomato Soup',
      aiGenerated: true,
      sources: [{ title: 'Best Tomato Soup', url: 'https://example.com/soup' }],
    }])
  })

  it('splits a request naming several recipes into one generated recipe per item', async () => {
    geminiService.generateStructured
      .mockResolvedValueOnce({ recipes: ['chocolate cake', 'vanilla frosting'] })
      .mockResolvedValueOnce({ title: 'Chocolate Cake' })
      .mockResolvedValueOnce({ title: 'Vanilla Frosting' })
    geminiService.generateWithSearch
      .mockResolvedValueOnce({ text: 'Chocolate cake write-up', sources: [] })
      .mockResolvedValueOnce({ text: 'Vanilla frosting write-up', sources: [] })

    const result = await service.generate('chocolate cake and vanilla frosting')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ title: 'Chocolate Cake', aiGenerated: true, sources: [] })
    expect(result[1]).toEqual({ title: 'Vanilla Frosting', aiGenerated: true, sources: [] })
  })

  it('falls back to the original query as a single recipe if the split step returns no items', async () => {
    geminiService.generateStructured
      .mockResolvedValueOnce({ recipes: [] })
      .mockResolvedValueOnce({ title: 'Tomato Soup' })
    geminiService.generateWithSearch.mockResolvedValue({ text: 'write-up', sources: [] })

    const result = await service.generate('best tomato soup')

    expect(result).toEqual([{ title: 'Tomato Soup', aiGenerated: true, sources: [] }])
  })

  it('propagates a Gemini error from the research step', async () => {
    geminiService.generateStructured.mockResolvedValueOnce({ recipes: ['pasta'] })
    geminiService.generateWithSearch.mockRejectedValue(new Error('Gemini quota exceeded'))
    await expect(service.generate('pasta')).rejects.toThrow('Gemini quota exceeded')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest ai-generate/recipe-ai-generate.service.spec.ts`
Expected: FAIL - `generate` still returns a single object, no split step exists.

- [ ] **Step 3: Implement the split step**

Replace the contents of `api/src/recipes/ai-generate/recipe-ai-generate.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { GeminiService } from '../../ai/gemini.service'
import type { ImportedRecipe } from '../import/source-extractor'

const SPLIT_PROMPT = `Does the following request describe one recipe, or several separate recipes? List each recipe as its own short search-style request (the way you'd search for one recipe at a time), even if there's only one. Return ONLY JSON matching this shape: {"recipes": ["request 1", "request 2", ...]}

Request: `

const RESEARCH_PROMPT = `You are a professional recipe researcher. Use Google Search to find the best existing recipe (or the best combination of a few similar recipes) for the following request. Do not invent a recipe from imagination - base it on what real recipe sites/videos actually say. Write up the resulting recipe in full detail: title, a short description, cuisine, category, prep/cook time, servings, difficulty, full ingredient list with amounts and units, and full step-by-step instructions. Mention which sources you drew from.

Request: `

const STRUCTURE_PROMPT = `Convert the following recipe write-up into a strict JSON object matching this exact shape (omit fields you cannot determine, but always include "title"):

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
  "kosherType": "one of: meat, dairy, parve - meat if it contains any meat, poultry, or fish; dairy if it contains dairy and no meat/poultry/fish of any kind; parve if it contains neither. Omit only if you genuinely cannot tell.",
  "ingredients": [{ "group": "Hebrew group name or empty string", "groupEn": "English group name or empty string", "items": [{ "amount": "number", "unit": "one of: g, kg, ml, l, cup, tbsp, tsp, cm, mm, pcs, cloves, bunch, sprigs, or empty string - but ONLY leave it empty for a naturally countable whole item (e.g. \\"1 onion\\", \\"10 grapes\\", \\"1 garlic clove\\"). Never leave it empty for something measured by mass or volume (e.g. milk, butter, flour, oil) - \\"1 milk\\" or \\"1 butter\\" with no unit is wrong, use g/ml/etc for those.", "name": "Hebrew ingredient name", "nameEn": "English ingredient name" }] }],
  "steps": [{ "title": "Hebrew section title or empty string", "titleEn": "English section title or empty string", "items": [{ "instruction": "Hebrew step text", "instructionEn": "English step text", "timerMinutes": "number if this step mentions a specific duration" }] }],
  "tips": ["Hebrew tips"],
  "tipsEn": ["English tips"]
}

Always fill in both the Hebrew and English version of every text field, translating as needed. The "unit" field is displayed translated by the app itself, so it must always be one of the exact tokens listed above (in English), never a translated or free-form word. Do not include a "sources" field - sources are attached separately. Respond with ONLY the JSON object, no other text.

Recipe write-up:
`

export interface AiGeneratedRecipe extends ImportedRecipe {
  aiGenerated: true
  sources: { title: string; url: string }[]
}

@Injectable()
export class RecipeAiGenerateService {
  constructor(private readonly gemini: GeminiService) {}

  // A single free-text request can name one recipe or several ("chocolate
  // cake and vanilla frosting") - split it into individually-searchable
  // requests first, then run the existing research->structure pipeline once
  // per identified recipe, in parallel. Falls back to treating the whole
  // request as one recipe if the split step comes back empty.
  async generate(query: string): Promise<AiGeneratedRecipe[]> {
    const { recipes: subQueries } = await this.gemini.generateStructured<{ recipes: string[] }>(`${SPLIT_PROMPT}${query}`)
    const queries = subQueries.length > 0 ? subQueries : [query]
    return Promise.all(queries.map(q => this.generateOne(q)))
  }

  // Two-step because the Gemini API rejects combining the googleSearch tool
  // with JSON-constrained output: first research the request with live
  // search grounding (free-text result + cited source URLs), then convert
  // that write-up into the app's strict recipe JSON shape.
  private async generateOne(query: string): Promise<AiGeneratedRecipe> {
    const { text, sources } = await this.gemini.generateWithSearch(`${RESEARCH_PROMPT}${query}`)
    const structured = await this.gemini.generateStructured<ImportedRecipe>(`${STRUCTURE_PROMPT}${text}`)
    return { ...structured, aiGenerated: true, sources }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest ai-generate/recipe-ai-generate.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/recipes/ai-generate/recipe-ai-generate.service.ts api/src/recipes/ai-generate/recipe-ai-generate.service.spec.ts
git commit -m "feat: split one AI-generate request into several recipes"
```

---

### Task 5: `RecipeAiGenerateController` persists the batch

**Files:**
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.controller.ts`
- Modify: `api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`

**Interfaces:**
- Consumes: `RecipeAiGenerateService.generate(query): Promise<AiGeneratedRecipe[]>` from Task 4, `RecipesService.createDraft(userId, dto, opts?)` from Task 2 (already injectable - `RecipeAiGenerateController` and `RecipesService` are both declared in `RecipesModule`, per `api/src/recipes/recipes.module.ts`, so this is a same-module injection, no module wiring changes needed).
- Produces: `POST /recipes/ai-generate` now returns `Record<string, unknown>[]` (an array of full created recipe objects, each with a real `id`) instead of a single ungenerated draft object.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { RecipeAiGenerateController } from './recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './recipe-ai-generate.service'
import { RecipesService } from '../recipes.service'

describe('RecipeAiGenerateController', () => {
  const aiGenerateService = { generate: jest.fn() }
  const recipesService = { createDraft: jest.fn() }
  const activityLog = { record: jest.fn() }
  const controller = new RecipeAiGenerateController(
    aiGenerateService as unknown as RecipeAiGenerateService,
    recipesService as unknown as RecipesService,
    activityLog as any,
  )

  beforeEach(() => jest.clearAllMocks())

  it('generates then persists each recipe as a pending-review draft sharing one batchId', async () => {
    aiGenerateService.generate.mockResolvedValue([
      { title: 'Chocolate Cake', aiGenerated: true, sources: [] },
      { title: 'Vanilla Frosting', aiGenerated: true, sources: [] },
    ])
    recipesService.createDraft
      .mockResolvedValueOnce({ toObject: () => ({ id: 'a', title: 'Chocolate Cake' }) })
      .mockResolvedValueOnce({ toObject: () => ({ id: 'b', title: 'Vanilla Frosting' }) })

    const result = await controller.generate({ query: 'chocolate cake and vanilla frosting' }, { userId: 'user_1' } as any)

    expect(recipesService.createDraft).toHaveBeenCalledTimes(2)
    const [, opts1] = recipesService.createDraft.mock.calls[0]
    const [, opts2] = recipesService.createDraft.mock.calls[1]
    // both calls share the exact same batchId
    expect(recipesService.createDraft.mock.calls[0][2]).toEqual({ pendingReview: true, batchId: expect.any(String) })
    expect(recipesService.createDraft.mock.calls[1][2].batchId).toBe(recipesService.createDraft.mock.calls[0][2].batchId)
    expect(recipesService.createDraft.mock.calls[0][0]).toBe('user_1')
    expect(opts1.pendingReview).toBe(true)
    expect(opts2.pendingReview).toBe(true)
    expect(result).toEqual([{ id: 'a', title: 'Chocolate Cake' }, { id: 'b', title: 'Vanilla Frosting' }])
  })

  it('throws BadRequestException when no query is provided', async () => {
    await expect(controller.generate({}, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when the query is blank', async () => {
    await expect(controller.generate({ query: '   ' }, { userId: 'user_1' } as any)).rejects.toThrow(BadRequestException)
  })

  it('logs an ai_recipe_generate_used event with the batch size after a successful generation', async () => {
    aiGenerateService.generate.mockResolvedValue([{ title: 'Soup', aiGenerated: true, sources: [] }])
    recipesService.createDraft.mockResolvedValue({ toObject: () => ({ id: 'a', title: 'Soup' }) })
    await controller.generate({ query: 'tomato soup' }, { userId: 'user_1' } as any)
    expect(activityLog.record).toHaveBeenCalledWith('user_1', undefined, 'ai_recipe_generate_used', { count: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest ai-generate/recipe-ai-generate.controller.spec.ts`
Expected: FAIL - constructor doesn't take `RecipesService`, `generate` still returns the raw AI output.

- [ ] **Step 3: Implement the controller**

Replace the contents of `api/src/recipes/ai-generate/recipe-ai-generate.controller.ts`:

```ts
import { Body, Controller, Post, BadRequestException, Req } from '@nestjs/common'
import { Request } from 'express'
import { randomUUID } from 'crypto'
import { RecipeAiGenerateService, type AiGeneratedRecipe } from './recipe-ai-generate.service'
import { RecipesService } from '../recipes.service'
import { ActivityLogService } from '../../activity-log/activity-log.service'
import { SaveRecipeDraftDto } from '../dto/save-recipe-draft.dto'

// The generated recipe's fields (title, ingredients, steps, ...) line up
// with SaveRecipeDraftDto's - this is constructed in-process (never bound
// from an HTTP body), so no ValidationPipe/whitelist stripping applies to
// it, unlike the client-facing create/update routes.
function toDraftDto(recipe: AiGeneratedRecipe): SaveRecipeDraftDto {
  const dto = new SaveRecipeDraftDto()
  Object.assign(dto, recipe)
  return dto
}

@Controller('recipes/ai-generate')
export class RecipeAiGenerateController {
  constructor(
    private readonly aiGenerateService: RecipeAiGenerateService,
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Post()
  async generate(@Body() body: { query?: string }, @Req() req: Request & { userId: string }) {
    if (!body.query?.trim()) {
      throw new BadRequestException('Provide a query describing the recipe to research')
    }
    const generated = await this.aiGenerateService.generate(body.query.trim())
    const batchId = randomUUID()
    const created = await Promise.all(
      generated.map(recipe => this.recipesService.createDraft(req.userId, toDraftDto(recipe), { pendingReview: true, batchId })),
    )
    await this.activityLog.record(req.userId, undefined, 'ai_recipe_generate_used', { count: created.length })
    return created.map(r => r.toObject())
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest ai-generate/recipe-ai-generate.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full backend suite to catch anything the signature change broke**

Run: `cd api && npm test`
Expected: PASS - no other file calls `RecipeAiGenerateController`'s constructor or `RecipeAiGenerateService.generate` directly.

- [ ] **Step 6: Commit**

```bash
git add api/src/recipes/ai-generate/recipe-ai-generate.controller.ts api/src/recipes/ai-generate/recipe-ai-generate.controller.spec.ts
git commit -m "feat: persist each bulk-generated recipe as a pending-review draft"
```

---

### Task 6: Frontend bulk-generate wiring

**Files:**
- Modify: `src/lib/recipeAiGenerate.ts`
- Modify: `src/hooks/useRecipes.ts`
- Modify: `src/components/RecipeAiGeneratePage.tsx`

**Interfaces:**
- Consumes: `POST /recipes/ai-generate` from Task 5 (now returns `Recipe[]`), `GET /recipes/pending` from Task 3.
- Produces: `generateRecipesWithAi(query, getToken): Promise<Recipe[]>` (renamed from `generateRecipeWithAi`), `usePendingDrafts(enabled?: boolean): { recipes: Recipe[]; loading: boolean; reload: () => Promise<void> }` - Task 7's sidebar consumes the hook.

- [ ] **Step 1: Rewrite the AI-generate lib function**

Replace the contents of `src/lib/recipeAiGenerate.ts`:

```ts
import { ApiError } from './api'
import type { Recipe } from '../types'

export async function generateRecipesWithAi(
  query: string,
  getToken: () => Promise<string | null>
): Promise<Recipe[]> {
  const token = await getToken()
  const res = await fetch('/api/recipes/ai-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const message = await res.json().then(d => d.message).catch(() => undefined)
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message ?? 'Generation failed')
  }
  return res.json()
}
```

- [ ] **Step 2: Add the `usePendingDrafts` hook**

In `src/hooks/useRecipes.ts`, add this new export right after `useMyRecipes` (same file already imports `useAuth`, `Recipe`, `apiFetch`, `notifyRecipeStatusChanged`/`onRecipeStatusChanged` - no new imports needed):

```ts
// Bulk-AI drafts the user hasn't reviewed/saved yet - powers the
// "drafts in progress" panel on the recipe editor.
export function usePendingDrafts(enabled = true) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  function reload() {
    return apiFetch<Recipe[]>('/recipes/pending', getToken).then(data => setRecipes(data))
  }

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !enabled) return
    let cancelled = false

    reload()
      .catch(() => { /* stale panel is a minor annoyance, not worth surfacing an error for */ })
      .finally(() => { if (!cancelled) setLoading(false) })

    const unsubscribe = onRecipeStatusChanged(() => { reload().catch(() => {}) })
    return () => { cancelled = true; unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, enabled, getToken])

  return { recipes, loading, reload }
}
```

- [ ] **Step 3: Update `RecipeAiGeneratePage` to navigate straight into the first draft's editor**

In `src/components/RecipeAiGeneratePage.tsx`, change the import and `handleGenerate`:

```tsx
import { generateRecipesWithAi } from '../lib/recipeAiGenerate'
```

```tsx
  async function handleGenerate() {
    const trimmed = query.trim()
    if (!trimmed) return
    setError(null)
    setLoading(true)
    try {
      const created = await generateRecipesWithAi(trimmed, getToken)
      navigate(`/recipes/${created[0].id}/edit`)
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'he' ? 'החיפוש נכשל' : 'Generation failed'))
    } finally {
      setLoading(false)
    }
  }
```

(This drops the old `navigate('/recipes/new', { state: { importedDraft: draft } })` in-memory path for this specific page only - `RecipeImportPage.tsx`'s own `importedDraft` flow for URL/text/file import is untouched, don't modify it.)

- [ ] **Step 4: Verify build and lint**

Run: `npm run build`
Expected: PASS

Run: `npx eslint 'src/**/*.{ts,tsx}' --format json`
Expected: no messages for the 3 touched files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipeAiGenerate.ts src/hooks/useRecipes.ts src/components/RecipeAiGeneratePage.tsx
git commit -m "feat: wire frontend to bulk AI generation and the pending-drafts endpoint"
```

---

### Task 7: Drafts-in-progress panel

**Files:**
- Create: `src/components/AiDraftsPanel.tsx`
- Modify: `src/components/RecipeForm.tsx`

**Interfaces:**
- Consumes: `usePendingDrafts()` from Task 6, `deleteRecipe(id, getToken)` (already exists in `src/hooks/useRecipes.ts`).
- Produces: `<AiDraftsPanel />` (no props) - self-contained, reads the current recipe id from the URL via `useParams`.

- [ ] **Step 1: Create the panel component**

Create `src/components/AiDraftsPanel.tsx`:

```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { usePendingDrafts, deleteRecipe } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'

// Shown above the recipe editor whenever more than one bulk-AI-generated
// draft is still pending review (not yet saved by the user). See the
// Global Constraints note in the implementation plan for why this is a
// horizontal strip rather than a true side column - RecipeForm's
// single-column layout doesn't have room for one without a page rewrite.
export default function AiDraftsPanel() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { id: currentId } = useParams<{ id: string }>()
  const { recipes, loading, reload } = usePendingDrafts()

  if (loading || recipes.length <= 1) return null

  async function handleRemove(id: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await deleteRecipe(id, getToken)
    await reload()
    if (id !== currentId) return
    const next = recipes.find(r => r.id !== id)
    navigate(next ? `/recipes/${next.id}/edit` : '/my-recipes')
  }

  return (
    <div className="max-w-3xl mx-auto mb-4">
      <div className="card p-3 space-y-1.5">
        <p className="text-xs font-semibold text-cream/50 px-1">
          {lang === 'he' ? `מתכונים בתהליך (${recipes.length})` : `Drafts in progress (${recipes.length})`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {recipes.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/recipes/${r.id}/edit`)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                r.id === currentId ? 'bg-amber/10 text-amber' : 'text-cream/70 hover:bg-tint/5'
              }`}
            >
              <span className="max-w-[10rem] truncate">{r.title || (lang === 'he' ? 'ללא שם' : 'Untitled')}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={e => handleRemove(r.id, e)}
                className="text-cream/30 hover:text-red-400"
              >
                ✕
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount it in `RecipeForm`**

In `src/components/RecipeForm.tsx`, add the import near the other component imports:

```tsx
import AiDraftsPanel from './AiDraftsPanel'
```

Find the component's outer return (`return (\n    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">\n      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">`) and add the panel as a sibling right before the `<form>`, still inside the outer `min-h-dvh` div:

```tsx
  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <AiDraftsPanel />
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build`
Expected: PASS

Run: `npx eslint 'src/**/*.{ts,tsx}' --format json`
Expected: no messages for `AiDraftsPanel.tsx` or `RecipeForm.tsx`.

- [ ] **Step 4: Manual verification**

No frontend unit test framework in this repo (established convention). Verify manually: generate a request that names 2+ recipes (e.g. "chocolate cake and vanilla frosting"), confirm the panel appears once you're editing the first one, confirm clicking the other entry navigates to it, confirm the ✕ deletes it and the panel updates without a page reload, confirm refreshing the page while editing still shows the panel (server-persisted, not just in-memory).

- [ ] **Step 5: Commit**

```bash
git add src/components/AiDraftsPanel.tsx src/components/RecipeForm.tsx
git commit -m "feat: show a drafts-in-progress panel when multiple bulk-AI drafts are pending"
```

---

## Phase B - Recipe linking

### Task 8: `linkedRecipeId` on ingredient items

**Files:**
- Modify: `src/types.ts`
- Modify: `api/src/recipes/dto/recipe.dto.ts`
- Modify: `api/src/recipes/dto/recipe.dto.spec.ts` (create if it doesn't exist - check first)
- Modify: `api/src/recipes/recipes.service.ts` (the `missingRequiredFields` ingredient-completeness check)
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Produces: `IngredientItem.linkedRecipeId?: string` (frontend), `IngredientItemDto.linkedRecipeId?: string` with `name` now optional-unless-unlinked (backend) - every later task in Phase B reads/writes this field by this exact name.

- [ ] **Step 1: Add the frontend type field**

In `src/types.ts`, inside `IngredientItem`, add:

```ts
export interface IngredientItem {
  amount: number
  unit: string
  name: string        // Hebrew
  nameEn?: string     // English
  note?: string
  noteEn?: string
  // When set, this ingredient references another recipe instead of a
  // free-text name - see RecipeLinkPicker/LinkedIngredientDisplay. `name`/
  // `nameEn` are cleared client-side whenever this is set.
  linkedRecipeId?: string
}
```

- [ ] **Step 2: Check for an existing DTO spec file**

Run: `ls api/src/recipes/dto/recipe.dto.spec.ts`

If it exists, read it and follow its style. If not, you're creating it in Step 3.

- [ ] **Step 3: Write the failing DTO validation test**

Create (or add to) `api/src/recipes/dto/recipe.dto.spec.ts`:

```ts
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { IngredientItemDto } from './recipe.dto'

describe('IngredientItemDto', () => {
  it('is valid with a name and no link', async () => {
    const dto = plainToInstance(IngredientItemDto, { name: 'Flour', amount: 200, unit: 'g' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('is valid with a linkedRecipeId and no name', async () => {
    const dto = plainToInstance(IngredientItemDto, { linkedRecipeId: 'recipe-1', amount: 800, unit: 'g' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('is invalid with neither a name nor a linkedRecipeId', async () => {
    const dto = plainToInstance(IngredientItemDto, { amount: 1, unit: 'pcs' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'name')).toBe(true)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd api && npx jest recipes/dto/recipe.dto.spec.ts`
Expected: FAIL - `linkedRecipeId` doesn't exist on the DTO, `name` is unconditionally required so the "valid with linkedRecipeId, no name" case fails.

- [ ] **Step 5: Update `IngredientItemDto`**

In `api/src/recipes/dto/recipe.dto.ts`, add `ValidateIf` to the imports:

```ts
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
```

Change `IngredientItemDto`:

```ts
export class IngredientItemDto {
  // Not IsInt: fractional amounts are common and valid ("חצי כף" = 0.5 tbsp,
  // 1.5 cups, etc.) - requiring an integer rejected every recipe using them.
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number

  @IsString()
  @IsOptional()
  unit?: string

  // Required unless this ingredient links to another recipe instead of
  // having a free-text name (see linkedRecipeId below).
  @ValidateIf(o => !o.linkedRecipeId)
  @IsString()
  @MinLength(1)
  name?: string

  @IsString()
  @IsOptional()
  nameEn?: string

  @IsString()
  @IsOptional()
  note?: string

  @IsString()
  @IsOptional()
  noteEn?: string

  // References another Recipe's id, used as this ingredient instead of a
  // typed name (e.g. "800g of [linked dough recipe]"). See
  // RecipesService.assertLinksResolve/assertNoCycle for the save-time
  // guards and submitForReview for the publish-time guard.
  @IsString()
  @IsOptional()
  linkedRecipeId?: string
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd api && npx jest recipes/dto/recipe.dto.spec.ts`
Expected: PASS

- [ ] **Step 7: Write the failing `missingRequiredFields` test**

Add to `api/src/recipes/recipes.service.spec.ts`, near the `submitForReview`/`missingRequiredFields`-adjacent tests (search for `completeRecipe` helper - it's defined lower in the file, use it):

```ts
  it('submitForReview treats a linked ingredient (no name) as complete', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'other-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)

    // Should reach the quality-review step rather than throwing "missing/invalid: ingredients"
    await expect(service.submitForReview('a', 'user_1', false)).resolves.toBeDefined()
  })
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "linked ingredient"`
Expected: FAIL - `missingRequiredFields` currently requires every ingredient item to have a non-empty `name`, so this throws `BadRequestException` instead of resolving.

- [ ] **Step 9: Update `missingRequiredFields`**

In `api/src/recipes/recipes.service.ts`, change the ingredient-completeness check inside `missingRequiredFields`:

```ts
    const ingredientGroups = (recipe.ingredients ?? []) as { items?: { name?: string; linkedRecipeId?: string }[] }[]
    if (ingredientGroups.length === 0) {
      missing.push('ingredients')
    } else {
      const hasIncompleteItem = ingredientGroups.some(g =>
        !g.items || g.items.length === 0 || g.items.some(item => !item.name?.trim() && !item.linkedRecipeId)
      )
      if (hasIncompleteItem) missing.push('ingredients (every item needs a name or a linked recipe)')
    }
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: PASS (full file).

- [ ] **Step 11: Verify frontend build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/types.ts api/src/recipes/dto/recipe.dto.ts api/src/recipes/dto/recipe.dto.spec.ts \
        api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: add linkedRecipeId to ingredient items, name required unless linked"
```

---

### Task 9: Unresolvable-link and circular-link guards on save

**Files:**
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `IngredientItemDto.linkedRecipeId` from Task 8.
- Produces: `RecipesService.createDraft`/`updateDraft` now reject (400) a payload whose `linkedRecipeId` doesn't resolve to a real, non-deleted recipe, and `updateDraft` additionally rejects (400) a payload that would create a circular link chain back to the recipe being saved.

- [ ] **Step 1: Write the failing tests**

Add to `api/src/recipes/recipes.service.spec.ts`:

```ts
  it('createDraft rejects a linkedRecipeId that does not resolve to a real recipe', async () => {
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService({ find })
    const dto = { title: 'Cake', ingredients: [{ group: '', items: [{ linkedRecipeId: 'missing-recipe' }] }] }
    await expect(service.createDraft('user_1', dto as any)).rejects.toThrow(BadRequestException)
  })

  it('createDraft allows a linkedRecipeId that resolves to a real recipe', async () => {
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'dough-recipe' }]) })
    const exists = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(false) })
    const create = jest.fn().mockResolvedValue({ id: 'cake', title: 'Cake' })
    const service = await makeService({ find, exists, create }, { create: jest.fn().mockResolvedValue({}) })
    const dto = { title: 'Cake', ingredients: [{ group: '', items: [{ linkedRecipeId: 'dough-recipe' }] }] }
    await expect(service.createDraft('user_1', dto as any)).resolves.toBeDefined()
  })

  it('updateDraft rejects a direct circular link (A links to B, saving B to link back to A)', async () => {
    const existing = { slug: 'b', ownerId: 'user_1', status: 'draft' }
    // findOne is called twice: once by getEditableOrThrow (plain .exec()),
    // once by linkedIdsOf('recipe-a') during the cycle walk (.select().lean().exec()).
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(existing) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: [{ items: [{ linkedRecipeId: 'b' }] }] }) })
    // find is called once, by assertLinksResolve, to confirm 'recipe-a' exists.
    const find = jest.fn()
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'recipe-a' }]) })
    const service = await makeService({ findOne, find })
    const dto = { title: 'B', ingredients: [{ group: '', items: [{ linkedRecipeId: 'recipe-a' }] }] }
    await expect(service.updateDraft('b', 'user_1', false, dto as any)).rejects.toThrow(BadRequestException)
  })
```

(`assertLinksResolve` calls `.find({...}).select().lean().exec()` (returns an array). `linkedIdsOf`, used inside the cycle walk, calls `.findOne({...}).select('ingredients').lean().exec()` (returns a single object) - these are two different Mongoose methods, mocked separately above. `getEditableOrThrow`'s own `findOne` call only chains `.exec()` directly, no `.select()`/`.lean()` - that's why the first `findOne` mock and the second have different shapes.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "linkedRecipeId\|circular"`
Expected: FAIL - neither guard exists yet.

- [ ] **Step 3: Add the guard helpers and wire them in**

In `api/src/recipes/recipes.service.ts`, add these private methods (place them near `missingRequiredFields`, after `updateDraft`):

```ts
  private extractLinkedIds(ingredients: { items: { linkedRecipeId?: string }[] }[]): string[] {
    return [...new Set(ingredients.flatMap(g => g.items.map(i => i.linkedRecipeId).filter((v): v is string => !!v)))]
  }

  // Every linkedRecipeId in the payload must resolve to a real, non-deleted
  // recipe - the link picker only ever offers already-persisted recipes, so
  // this should be structurally unreachable from the UI; it's a defensive
  // backend check (also catches a link target removed after being linked).
  private async assertLinksResolve(ingredients?: { items: { linkedRecipeId?: string }[] }[]): Promise<void> {
    const ids = this.extractLinkedIds(ingredients ?? [])
    if (ids.length === 0) return
    let found: { _id: unknown }[]
    try {
      found = await this.recipeModel.find({ _id: { $in: ids }, deletedAt: { $exists: false } }).select('_id').lean().exec()
    } catch (err) {
      if (isCastError(err)) found = []
      else throw err
    }
    const foundIds = new Set(found.map(r => String(r._id)))
    const missing = ids.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot save: linked recipe(s) not found: ${missing.join(', ')}`)
    }
  }

  // A recipe's own linked ingredients, read fresh from the database (used
  // while walking the link graph - not the in-memory document being saved).
  private async linkedIdsOf(id: string): Promise<string[]> {
    let recipe: { ingredients?: { items: { linkedRecipeId?: string }[] }[] } | null
    try {
      recipe = await this.recipeModel.findOne({ _id: id, deletedAt: { $exists: false } }).select('ingredients').lean().exec()
    } catch (err) {
      if (isCastError(err)) return []
      throw err
    }
    if (!recipe) return []
    return this.extractLinkedIds(recipe.ingredients ?? [])
  }

  // BFS over the linkedRecipeId graph starting from `startIds`, depth-capped
  // to guard against a runaway walk from bad data.
  private async walkLinkedRecipes(startIds: string[]): Promise<Set<string>> {
    const visited = new Set<string>()
    let frontier = [...new Set(startIds)]
    let depth = 0
    while (frontier.length > 0 && depth < 50) {
      const next: string[] = []
      for (const id of frontier) {
        if (visited.has(id)) continue
        visited.add(id)
        next.push(...(await this.linkedIdsOf(id)))
      }
      frontier = next
      depth += 1
    }
    return visited
  }

  // Only meaningful on update - a brand-new recipe has no id yet for
  // anything else to reference, so it can't already be part of a cycle.
  private async assertNoCycle(recipeId: string, ingredients?: { items: { linkedRecipeId?: string }[] }[]): Promise<void> {
    const directLinks = this.extractLinkedIds(ingredients ?? [])
    if (directLinks.length === 0) return
    const reachable = await this.walkLinkedRecipes(directLinks)
    if (reachable.has(recipeId)) {
      throw new BadRequestException('This would create a circular recipe link')
    }
  }
```

Then wire both into `createDraft` (add at the very top, before `generateUniqueSlug`):

```ts
  async createDraft(
    userId: string,
    dto: SaveRecipeDraftDto,
    opts: { pendingReview?: boolean; batchId?: string } = {},
  ): Promise<RecipeDocument> {
    await this.assertLinksResolve(dto.ingredients)
    const slug = await this.generateUniqueSlug(dto.title)
    ...
```

And into `updateDraft` (add right after `getEditableOrThrow`, before the `wasRejected` line):

```ts
  async updateDraft(id: string, userId: string, isAdmin: boolean, dto: SaveRecipeDraftDto): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    await this.assertLinksResolve(dto.ingredients)
    await this.assertNoCycle(id, dto.ingredients)
    // Editing a rejected recipe means the owner is addressing the feedback -
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: PASS (full file - re-run the whole file since these guards run on every `createDraft`/`updateDraft` call, including all the pre-existing tests for those two methods that don't set `ingredients` at all; `assertLinksResolve`/`assertNoCycle` must both no-op cleanly when `dto.ingredients` is `undefined` or contains no links).

- [ ] **Step 5: Commit**

```bash
git add api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: reject saves with an unresolvable or circular recipe link"
```

---

### Task 10: Delete guard - can't delete a recipe that's linked from another

**Files:**
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `IngredientItemDto.linkedRecipeId` from Task 8.
- Produces: `RecipesService.remove` now rejects (403) deleting a recipe that any other non-deleted recipe currently links to as an ingredient.

- [ ] **Step 1: Write the failing tests**

Add to `api/src/recipes/recipes.service.spec.ts`, near the existing `remove` tests:

```ts
  it('remove throws ForbiddenException when another recipe links to this one as an ingredient', async () => {
    const recipe = { id: 'dough-recipe', title: 'Dough', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(true)
    const service = await makeService({ findOne, exists })
    await expect(service.remove('dough-recipe', 'user_1', false)).rejects.toThrow(ForbiddenException)
    expect(exists).toHaveBeenCalledWith({ 'ingredients.items.linkedRecipeId': 'dough-recipe', deletedAt: { $exists: false } })
  })

  it('remove succeeds when no other recipe links to this one', async () => {
    const recipe = { id: 'a', title: 'Solo', ownerId: 'user_1', status: 'draft', publishedRevision: null, save: jest.fn() }
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe) })
    const exists = jest.fn().mockResolvedValue(false)
    const service = await makeService({ findOne, exists })
    await expect(service.remove('a', 'user_1', false)).resolves.toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "links to this one"`
Expected: FAIL - no such guard exists in `remove` yet, `recipeModel.exists` isn't called.

- [ ] **Step 3: Add the guard**

In `api/src/recipes/recipes.service.ts`, add the check as the first guard inside `remove`, right after the `if (!recipe) return` line:

```ts
  async remove(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const recipe = await this.recipeModel.findOne({ _id: id }).exec()
    if (!recipe) return
    const isLinkedElsewhere = await this.recipeModel.exists({ 'ingredients.items.linkedRecipeId': id, deletedAt: { $exists: false } })
    if (isLinkedElsewhere) {
      throw new ForbiddenException('This recipe is used as a linked ingredient in another recipe and cannot be deleted')
    }
    if (recipe.publishedRevision != null) {
      throw new ForbiddenException('A recipe that has ever been published can never be deleted')
    }
    ...
```

(Leave everything below this new block exactly as it is - `status === 'pending_review'`, ownership check, soft-delete, activity log.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: block deleting a recipe that's linked as an ingredient elsewhere"
```

---

### Task 11: Publish guard - can't publish while a linked recipe is unpublished

**Files:**
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `walkLinkedRecipes`/`linkedIdsOf` private helpers from Task 9.
- Produces: `RecipesService.submitForReview` now rejects (400) before the quality-review call if any recipe reachable through this recipe's linked ingredients (direct or transitive) has no `publishedRevision`.

- [ ] **Step 1: Write the failing tests**

Add to `api/src/recipes/recipes.service.spec.ts`, near the existing `submitForReview` tests (use the `completeRecipe` helper already defined lower in the file):

```ts
  it('submitForReview throws BadRequestException when a directly linked recipe is not published', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'dough-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(recipe) }) // getEditableOrThrow
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: recipe.ingredients }) }) // linkedIdsOf(recipe.id)
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'dough-recipe', publishedRevision: null, title: 'Dough' }]) })
    const service = await makeService({ findOne, find })
    await expect(service.submitForReview('a', 'user_1', false)).rejects.toThrow(BadRequestException)
  })

  it('submitForReview allows publishing when every linked recipe is already published', async () => {
    const recipe = completeRecipe({
      ingredients: [{ group: 'Main', items: [{ linkedRecipeId: 'dough-recipe', amount: 800, unit: 'g' }] }],
    })
    const findOne = jest.fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(recipe) })
      .mockReturnValueOnce({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({ ingredients: recipe.ingredients }) })
    const find = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([{ _id: 'dough-recipe', publishedRevision: 1, title: 'Dough' }]) })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 100, checkedAt: 'now', findings: [] })
    const service = await makeService({ findOne, find }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality)
    await expect(service.submitForReview('a', 'user_1', false)).resolves.toBeDefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && npx jest recipes/recipes.service.spec.ts -t "linked recipe is"`
Expected: FAIL - no such guard exists in `submitForReview` yet.

- [ ] **Step 3: Add the guard**

In `api/src/recipes/recipes.service.ts`, add a new private method near `missingRequiredFields`:

```ts
  // Walks this recipe's linked ingredients transitively (reusing the same
  // graph walk the cycle-detection guard uses) and confirms every reachable
  // recipe is published - a recipe can't go live while something it depends
  // on as an ingredient isn't publicly visible yet.
  private async assertLinksPublishable(recipeId: string): Promise<void> {
    const directLinks = await this.linkedIdsOf(recipeId)
    if (directLinks.length === 0) return
    const reachable = await this.walkLinkedRecipes(directLinks)
    const linked = await this.recipeModel.find({ _id: { $in: [...reachable] } }).select('publishedRevision title').lean().exec()
    const unpublished = linked.filter(r => r.publishedRevision == null)
    if (unpublished.length > 0) {
      throw new BadRequestException(`Cannot publish: linked recipe(s) not yet published: ${unpublished.map(r => r.title).join(', ')}`)
    }
  }
```

Wire it into `submitForReview`, right after the existing `missingRequiredFields` check:

```ts
  async submitForReview(id: string, userId: string, isAdmin: boolean): Promise<RecipeDocument> {
    const recipe = await this.getEditableOrThrow(id, userId, isAdmin)
    const missing = this.missingRequiredFields(recipe)
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot submit for review, missing/invalid: ${missing.join(', ')}`)
    }
    await this.assertLinksPublishable(id)

    await this.activityLogService.record(userId, id, 'recipe_submitted_for_review')
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && npx jest recipes/recipes.service.spec.ts`
Expected: PASS (full file).

- [ ] **Step 5: Run the full backend suite**

Run: `cd api && npm test`
Expected: PASS - all suites.

- [ ] **Step 6: Commit**

```bash
git add api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: block publishing a recipe while a linked recipe isn't published"
```

---

### Task 12: `RecipeLinkPicker` component

**Files:**
- Create: `src/components/RecipeLinkPicker.tsx`

**Interfaces:**
- Consumes: `useMyRecipes()`, `useRecipes()` (both already exist), `Modal` component (already exists, used elsewhere - check `src/components/EditableImageField.tsx` or `ImageCropModal.tsx` for the exact import/usage pattern before writing this).
- Produces: `<RecipeLinkPicker excludeId={string} onSelect={(recipe: { id: string; title: string; titleHe?: string }) => void} onClose={() => void} />` - Task 13 renders this from `RecipeForm`.

- [ ] **Step 1: Check the existing `Modal` usage pattern**

Run: `grep -n "import Modal\|<Modal" src/components/EditableImageField.tsx`

Match that exact import path and prop usage (`open`, `onOpenChange`, `zIndexClassName`, `panelClassName`) in Step 2.

- [ ] **Step 2: Create the component**

Create `src/components/RecipeLinkPicker.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import Modal from './Modal'
import { useMyRecipes, useRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'

interface LinkTarget {
  id: string
  title: string
  titleHe?: string
}

interface RecipeLinkPickerProps {
  excludeId?: string
  onSelect: (recipe: LinkTarget) => void
  onClose: () => void
}

// Searches recipes already loaded client-side (the user's own + published
// site-wide) rather than hitting a new search endpoint - same data Home's
// own search already filters.
export default function RecipeLinkPicker({ excludeId, onSelect, onClose }: RecipeLinkPickerProps) {
  const { lang } = useLanguage()
  const [query, setQuery] = useState('')
  const { recipes: mine } = useMyRecipes()
  const { recipes: published } = useRecipes()

  const options = useMemo(() => {
    const merged = new Map<string, LinkTarget>()
    for (const r of [...mine, ...published]) {
      if (r.id === excludeId) continue
      merged.set(r.id, { id: r.id, title: r.title, titleHe: r.titleHe })
    }
    const q = query.trim().toLowerCase()
    return [...merged.values()]
      .filter(r => !q || r.title.toLowerCase().includes(q) || (r.titleHe ?? '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [mine, published, query, excludeId])

  return (
    <Modal open onOpenChange={next => { if (!next) onClose() }} zIndexClassName="z-50" panelClassName="max-w-md p-5 space-y-3">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">
        {lang === 'he' ? 'קשר למתכון' : 'Link to a recipe'}
      </Dialog.Title>
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={lang === 'he' ? 'חיפוש מתכון...' : 'Search recipes...'}
        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
      />
      <div className="max-h-72 overflow-y-auto space-y-1">
        {options.length === 0 && (
          <p className="text-xs text-cream/30 text-center py-6">{lang === 'he' ? 'לא נמצאו מתכונים' : 'No recipes found'}</p>
        )}
        {options.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            className="w-full text-start p-2 rounded-lg text-sm text-cream/80 hover:bg-tint/10 transition-colors truncate"
          >
            {lang === 'he' ? (r.titleHe || r.title) : r.title}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="btn-ghost text-sm">
          {lang === 'he' ? 'סגור' : 'Close'}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Verify build and lint**

Run: `npm run build`
Expected: PASS (component isn't rendered anywhere yet, but must compile standalone).

Run: `npx eslint src/components/RecipeLinkPicker.tsx --format json`
Expected: no messages.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecipeLinkPicker.tsx
git commit -m "feat: add RecipeLinkPicker component for choosing a linked recipe"
```

---

### Task 13: Wire linking into the ingredient editor

**Files:**
- Create: `src/components/LinkedIngredientDisplay.tsx`
- Modify: `src/components/RecipeForm.tsx`

**Interfaces:**
- Consumes: `RecipeLinkPicker` from Task 12, `useRecipe(id)` (already exists in `src/hooks/useRecipes.ts`), `IngredientItem.linkedRecipeId` from Task 8, `updateIngredientItem(gi, ii, patch)` (already exists in `RecipeForm.tsx`).

- [ ] **Step 1: Create the linked-ingredient display component**

Create `src/components/LinkedIngredientDisplay.tsx`:

```tsx
import { useRecipe } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'

interface LinkedIngredientDisplayProps {
  recipeId: string
  onUnlink: () => void
}

// Replaces the free-text name/nameEn inputs for an ingredient that links to
// another recipe instead - fetches that recipe just to show its title
// (useRecipe already exists and handles auth/loading), not for any other
// purpose.
export default function LinkedIngredientDisplay({ recipeId, onUnlink }: LinkedIngredientDisplayProps) {
  const { lang } = useLanguage()
  const { recipe, loading } = useRecipe(recipeId)

  return (
    <div className="flex items-center gap-2 bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm">
      <svg className="w-3.5 h-3.5 text-amber shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l4-4a4 4 0 015.656 5.656l-1.5 1.5" />
      </svg>
      <span className="flex-1 min-w-0 truncate text-cream/80">
        {loading
          ? '...'
          : recipe
            ? (lang === 'he' ? (recipe.titleHe || recipe.title) : recipe.title)
            : (lang === 'he' ? 'מתכון לא נמצא' : 'Recipe not found')}
      </span>
      <button type="button" onClick={onUnlink} className="shrink-0 text-cream/30 hover:text-red-400 text-xs">
        {lang === 'he' ? 'בטל קישור' : 'Unlink'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add imports and state to `RecipeForm.tsx`**

Add these imports near the other component imports:

```tsx
import RecipeLinkPicker from './RecipeLinkPicker'
import LinkedIngredientDisplay from './LinkedIngredientDisplay'
```

Add state near the other `useState` declarations (e.g. next to `saving`/`error`):

```tsx
  const [linkPickerFor, setLinkPickerFor] = useState<{ gi: number; ii: number } | null>(null)
```

- [ ] **Step 3: Replace the ingredient-item name row**

In `RecipeForm.tsx`, find this exact block (the ingredient item's amount/unit/remove row plus the name inputs and regenerate button):

```tsx
                              {({ attributes: itemAttrs, listeners: itemListeners }) => (
                                <div className="flex items-start gap-2">
                                  <DragHandle attributes={itemAttrs} listeners={itemListeners} className="mt-2.5" />
                                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                                    <div className="flex gap-2">
                                      <input type="number" step="any" value={item.amount ?? ''} onChange={e => updateIngredientItem(gi, ii, { amount: Number(e.target.value) })} className={`${inputClass} !w-16 shrink-0`} placeholder={lang === 'he' ? 'כמות' : 'Qty'} />
                                      <input value={item.unit ?? ''} onChange={e => updateIngredientItem(gi, ii, { unit: e.target.value })} className={`${inputClass} !w-16 shrink-0`} placeholder={lang === 'he' ? 'יחידה' : 'Unit'} />
                                      <button type="button" onClick={() => removeIngredientItem(gi, ii)} className="shrink-0 text-red-400/60 hover:text-red-400 text-xs px-1">✕</button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <input {...fieldBindings(`ing-${item._key}`, item.name, v => updateIngredientItem(gi, ii, { name: v }), `ingEn-${item._key}`, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { nameEn: v }), 'en')} className={inputClass} placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'} dir="rtl" />
                                      <input {...fieldBindings(`ingEn-${item._key}`, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { nameEn: v }), `ing-${item._key}`, item.name, v => updateIngredientItem(gi, ii, { name: v }), 'he')} className={inputClass} placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'} />
                                    </div>
                                  </div>
                                  <RegenerateButton
                                    lang={lang}
                                    busy={regenerating.has(`ing-${item._key}`)}
                                    onClick={() => regenerateTranslation(`ing-${item._key}`, item.name, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { name: v }), v => updateIngredientItem(gi, ii, { nameEn: v }))}
                                  />
                                </div>
                              )}
```

Replace it with:

```tsx
                              {({ attributes: itemAttrs, listeners: itemListeners }) => (
                                <div className="flex items-start gap-2">
                                  <DragHandle attributes={itemAttrs} listeners={itemListeners} className="mt-2.5" />
                                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                                    <div className="flex gap-2">
                                      <input type="number" step="any" value={item.amount ?? ''} onChange={e => updateIngredientItem(gi, ii, { amount: Number(e.target.value) })} className={`${inputClass} !w-16 shrink-0`} placeholder={lang === 'he' ? 'כמות' : 'Qty'} />
                                      <input value={item.unit ?? ''} onChange={e => updateIngredientItem(gi, ii, { unit: e.target.value })} className={`${inputClass} !w-16 shrink-0`} placeholder={lang === 'he' ? 'יחידה' : 'Unit'} />
                                      {!item.linkedRecipeId && (
                                        <button type="button" onClick={() => setLinkPickerFor({ gi, ii })} title={lang === 'he' ? 'קשר למתכון' : 'Link to recipe'} className="shrink-0 text-cream/30 hover:text-amber text-xs px-1">
                                          🔗
                                        </button>
                                      )}
                                      <button type="button" onClick={() => removeIngredientItem(gi, ii)} className="shrink-0 text-red-400/60 hover:text-red-400 text-xs px-1">✕</button>
                                    </div>
                                    {item.linkedRecipeId ? (
                                      <LinkedIngredientDisplay
                                        recipeId={item.linkedRecipeId}
                                        onUnlink={() => updateIngredientItem(gi, ii, { linkedRecipeId: undefined })}
                                      />
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input {...fieldBindings(`ing-${item._key}`, item.name, v => updateIngredientItem(gi, ii, { name: v }), `ingEn-${item._key}`, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { nameEn: v }), 'en')} className={inputClass} placeholder={lang === 'he' ? 'שם (עברית)' : 'Name (Hebrew)'} dir="rtl" />
                                        <input {...fieldBindings(`ingEn-${item._key}`, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { nameEn: v }), `ing-${item._key}`, item.name, v => updateIngredientItem(gi, ii, { name: v }), 'he')} className={inputClass} placeholder={lang === 'he' ? 'שם (אנגלית)' : 'Name (English)'} />
                                      </div>
                                    )}
                                  </div>
                                  {!item.linkedRecipeId && (
                                    <RegenerateButton
                                      lang={lang}
                                      busy={regenerating.has(`ing-${item._key}`)}
                                      onClick={() => regenerateTranslation(`ing-${item._key}`, item.name, item.nameEn ?? '', v => updateIngredientItem(gi, ii, { name: v }), v => updateIngredientItem(gi, ii, { nameEn: v }))}
                                    />
                                  )}
                                </div>
                              )}
```

- [ ] **Step 4: Render the picker modal**

Find the end of the ingredients section - the closing of the ingredient-groups block, specifically this line (the "Add ingredient group" button that closes out the Ingredients `<div>`):

```tsx
          <button type="button" onClick={addIngredientGroup} className="btn-ghost text-xs">
            + {lang === 'he' ? 'הוסף קבוצת רכיבים' : 'Add ingredient group'}
          </button>
        </div>
```

Add the picker right after that closing `</div>` (still inside the form, as a sibling of the Ingredients card):

```tsx
          <button type="button" onClick={addIngredientGroup} className="btn-ghost text-xs">
            + {lang === 'he' ? 'הוסף קבוצת רכיבים' : 'Add ingredient group'}
          </button>
        </div>

        {linkPickerFor && (
          <RecipeLinkPicker
            excludeId={existing?.id}
            onSelect={recipe => {
              updateIngredientItem(linkPickerFor.gi, linkPickerFor.ii, { linkedRecipeId: recipe.id, name: '', nameEn: '' })
              setLinkPickerFor(null)
            }}
            onClose={() => setLinkPickerFor(null)}
          />
        )}
```

- [ ] **Step 5: Fix the submit-time ingredient filter to keep linked items**

Find this exact line in `handleSubmit` (it currently drops any ingredient item with an empty `name`, which would silently delete every linked ingredient on save since linked items have no name):

```tsx
        ingredients: stripIngredientKeys(
          ingredientGroups
            .map(g => ({ ...g, items: g.items.filter(item => item.name.trim() !== '') }))
            .filter(g => g.items.length > 0)
        ),
```

Replace the filter with:

```tsx
        ingredients: stripIngredientKeys(
          ingredientGroups
            .map(g => ({ ...g, items: g.items.filter(item => item.name.trim() !== '' || item.linkedRecipeId) }))
            .filter(g => g.items.length > 0)
        ),
```

- [ ] **Step 6: Verify build and lint**

Run: `npm run build`
Expected: PASS

Run: `npx eslint 'src/**/*.{ts,tsx}' --format json`
Expected: no messages for the touched files.

- [ ] **Step 7: Manual verification**

No frontend unit test framework in this repo. Verify manually: add an ingredient, click the link button, pick another recipe, confirm the name inputs are replaced by the linked display with the correct title, save the recipe and reload it, confirm the link survived (didn't get silently dropped by the old filter bug). Try to delete a recipe that's linked from another - confirm it's blocked. Try to publish a recipe that links to an unpublished recipe - confirm it's blocked with a clear message. Try linking two recipes to each other (A links to B, then edit B to link back to A) - confirm the second save is rejected as circular.

- [ ] **Step 8: Commit**

```bash
git add src/components/LinkedIngredientDisplay.tsx src/components/RecipeForm.tsx
git commit -m "feat: wire recipe linking into the ingredient editor, fix name-filter dropping linked items"
```
