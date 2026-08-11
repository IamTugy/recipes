# Dish Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group recipes for the same specific dish (e.g. all "Caprese Salad" recipes) so the published-recipes browsing screen can show them as one collapsible group card instead of individual near-duplicate entries.

**Architecture:** A new `RecipeGroupingService` calls Gemini once per publish (reusing the existing `GeminiService`, same pattern as `RecipeQualityService`/`RecipeSimilarityService`) to either match the recipe to an existing `DishGroup` or propose a new specific dish name, denormalizing the result onto the `Recipe` document so browsing needs no join. The frontend adds a toggle to `Home.tsx` that, when on, collapses recipes sharing a group (2+ members) into a `GroupCard`; clicking one filters the grid to just that group via a URL param.

**Tech Stack:** NestJS (`api/`), Mongoose, `@google/genai` via the existing `GeminiService`, React/Vite (`src/`), Jest.

## Global Constraints

- A dish group name must be **specific**, never category-level: "Salad" is rejected, "Caprese Salad" is correct. The AI prompt must explicitly instruct and exemplify this.
- Grouping runs on every successful publish (`submitForReview`'s existing publish-success branch), same cost/frequency as the quality review that already runs there.
- A group is only ever *displayed* as a group when 2+ currently-published recipes share a `dishGroupId` — computed live from the loaded recipe list on the frontend, never cached, so a shrinking group naturally reverts to individual cards.
- Denormalize `dishGroupName`/`dishGroupNameHe` onto `Recipe` at assignment time — no new read endpoint, no join, `GET /recipes` already serves everything needed.
- Don't trust unverified AI output: an `existingGroupId` that doesn't match a real fetched group must fall back to creating a new group (from a sanitized version of the recipe's title if the AI also failed to propose a name), never silently drop the recipe ungrouped.
- No new npm dependencies.

---

### Task 1: DishGroup schema + RecipeGroupingService

**Files:**
- Create: `api/src/recipes/schemas/dish-group.schema.ts`
- Create: `api/src/recipes/grouping/recipe-grouping.service.ts`
- Test: `api/src/recipes/grouping/recipe-grouping.service.spec.ts`

**Interfaces:**
- Consumes: `GeminiService.generateStructured<T>(prompt: string, temperature?: number): Promise<T>` (already exists, added by the duplicate-detection feature).
- Produces (used by Task 2): `RecipeGroupingService.assignGroup(recipe: GroupableRecipe): Promise<{ id: string; name: string; nameHe?: string }>` where:
  ```typescript
  interface GroupableRecipe {
    title?: string
    titleHe?: string
    ingredients?: unknown
  }
  ```

- [ ] **Step 1: Create the DishGroup schema**

Create `api/src/recipes/schemas/dish-group.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type DishGroupDocument = DishGroup & Document

@Schema({ timestamps: true })
export class DishGroup {
  @Prop({ required: true })
  name!: string       // English canonical dish name, e.g. "Caprese Salad"

  @Prop()
  nameHe?: string      // Hebrew canonical dish name
}

export const DishGroupSchema = SchemaFactory.createForClass(DishGroup)
```

- [ ] **Step 2: Write the failing tests for RecipeGroupingService**

Create `api/src/recipes/grouping/recipe-grouping.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipeGroupingService } from './recipe-grouping.service'
import { DishGroup } from '../schemas/dish-group.schema'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeGroupingService', () => {
  const generateStructured = jest.fn()
  const gemini = { generateStructured }

  function makeExistingGroups(groups: { id: string; name: string; nameHe?: string }[]) {
    return groups.map(g => ({ _id: { toString: () => g.id }, name: g.name, nameHe: g.nameHe }))
  }

  async function makeService(existingGroups: { id: string; name: string; nameHe?: string }[] = []) {
    const docs = makeExistingGroups(existingGroups)
    const exec = jest.fn().mockResolvedValue(docs)
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ select })
    const create = jest.fn().mockImplementation(async (doc: { name: string; nameHe?: string }) => ({
      _id: { toString: () => 'new-group-id' },
      name: doc.name,
      nameHe: doc.nameHe,
    }))
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeGroupingService,
        { provide: getModelToken(DishGroup.name), useValue: { find, create } },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile()
    return { service: moduleRef.get(RecipeGroupingService), find, create }
  }

  beforeEach(() => jest.clearAllMocks())

  const recipe = { title: 'Grandma\'s Caprese', titleHe: undefined, ingredients: [{ items: [{ name: 'Tomato' }] }] }

  it('returns the matched existing group when Gemini returns a real existingGroupId', async () => {
    generateStructured.mockResolvedValue({ existingGroupId: 'group-1' })
    const { service } = await makeService([{ id: 'group-1', name: 'Caprese Salad', nameHe: 'סלט קפרזה' }])

    const result = await service.assignGroup(recipe)

    expect(result).toEqual({ id: 'group-1', name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
  })

  it('creates a new group when Gemini proposes a new name', async () => {
    generateStructured.mockResolvedValue({ name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
    const { service, create } = await makeService([])

    const result = await service.assignGroup(recipe)

    expect(create).toHaveBeenCalledWith({ name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
    expect(result).toEqual({ id: 'new-group-id', name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
  })

  it('falls back to creating a new group when existingGroupId does not match any fetched group', async () => {
    generateStructured.mockResolvedValue({ existingGroupId: 'hallucinated-id', name: 'Caprese Salad' })
    const { service, create } = await makeService([{ id: 'group-1', name: 'Chocolate Chip Cookies' }])

    const result = await service.assignGroup(recipe)

    expect(create).toHaveBeenCalledWith({ name: 'Caprese Salad', nameHe: undefined })
    expect(result.id).toBe('new-group-id')
  })

  it('falls back to the recipe title when Gemini proposes no name and no valid existingGroupId', async () => {
    generateStructured.mockResolvedValue({})
    const { service, create } = await makeService([])

    const result = await service.assignGroup(recipe)

    expect(create).toHaveBeenCalledWith({ name: 'Grandma\'s Caprese', nameHe: undefined })
    expect(result.name).toBe('Grandma\'s Caprese')
  })

  it('sends the existing group list and the recipe to Gemini at temperature 0', async () => {
    generateStructured.mockResolvedValue({ name: 'Caprese Salad' })
    const { service } = await makeService([{ id: 'group-1', name: 'Chocolate Chip Cookies' }])

    await service.assignGroup(recipe)

    expect(generateStructured).toHaveBeenCalledTimes(1)
    const [prompt, temperature] = generateStructured.mock.calls[0]
    expect(temperature).toBe(0)
    expect(prompt).toContain('Caprese')
    expect(prompt).toContain('Chocolate Chip Cookies')
    expect(prompt).toContain('group-1')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd api && npx jest src/recipes/grouping/recipe-grouping.service.spec.ts`
Expected: FAIL with "Cannot find module './recipe-grouping.service'"

- [ ] **Step 4: Write the implementation**

Create `api/src/recipes/grouping/recipe-grouping.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { DishGroup, DishGroupDocument } from '../schemas/dish-group.schema'
import { GeminiService } from '../../ai/gemini.service'

export interface GroupableRecipe {
  title?: string
  titleHe?: string
  ingredients?: unknown
}

export interface AssignedGroup {
  id: string
  name: string
  nameHe?: string
}

interface GroupAssignmentVerdict {
  existingGroupId?: string
  name?: string
  nameHe?: string
}

interface ExistingGroupDoc {
  _id: { toString(): string }
  name: string
  nameHe?: string
}

const GROUP_ASSIGNMENT_PROMPT = `You are assigning a newly published recipe on a recipe-sharing app to a "dish group" - a specific, canonical name for the dish it is, used to group recipes together for browsing.

The name must be SPECIFIC, never a broad category. "Salad", "Cookies", or "Soup" are too broad and must never be used as a group name. "Caprese Salad" or "Chocolate Chip Cookies" are correctly specific.

You are given the recipe's title/ingredients, and a list of existing dish groups (each with an "id" and "name"). If this recipe is genuinely the same specific dish as one of the existing groups (not just the same broad category), return that group's exact "id" as "existingGroupId". Otherwise, propose a new specific dish name for it.

Return ONLY JSON matching this shape:
{"existingGroupId": string (omit entirely if none of the existing groups match), "name": string (the new specific dish name in English - required unless existingGroupId is set), "nameHe": string (optional - the new specific dish name in Hebrew)}`

@Injectable()
export class RecipeGroupingService {
  constructor(
    @InjectModel(DishGroup.name) private readonly dishGroupModel: Model<DishGroupDocument>,
    private readonly gemini: GeminiService,
  ) {}

  async assignGroup(recipe: GroupableRecipe): Promise<AssignedGroup> {
    const existingGroups = await this.dishGroupModel.find().select('name nameHe').lean().exec() as unknown as ExistingGroupDoc[]

    const prompt = `${GROUP_ASSIGNMENT_PROMPT}

Recipe:
${JSON.stringify({ title: recipe.title, titleHe: recipe.titleHe, ingredients: recipe.ingredients })}

Existing dish groups:
${JSON.stringify(existingGroups.map(g => ({ id: g._id.toString(), name: g.name, nameHe: g.nameHe })))}`

    // Low temperature, same rationale as the quality review and duplicate
    // judge: a checklist-style assignment should be reproducible, not creative.
    const verdict = await this.gemini.generateStructured<GroupAssignmentVerdict>(prompt, 0)

    if (verdict.existingGroupId) {
      const matched = existingGroups.find(g => g._id.toString() === verdict.existingGroupId)
      if (matched) {
        return { id: matched._id.toString(), name: matched.name, nameHe: matched.nameHe }
      }
    }

    // Gemini hallucinated an id outside the list, or proposed no match at
    // all - either way, start a new group rather than leaving the recipe
    // silently ungrouped. Fall back to the recipe's own title if it also
    // failed to propose a name.
    const name = verdict.name?.trim() || recipe.title?.trim() || 'Untitled dish'
    const nameHe = verdict.nameHe?.trim() || undefined
    const created = await this.dishGroupModel.create({ name, nameHe })
    return { id: created._id.toString(), name: created.name, nameHe: created.nameHe }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd api && npx jest src/recipes/grouping/recipe-grouping.service.spec.ts`
Expected: PASS, all 5 tests green

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/schemas/dish-group.schema.ts api/src/recipes/grouping/recipe-grouping.service.ts api/src/recipes/grouping/recipe-grouping.service.spec.ts
git commit -m "feat: add DishGroup schema and RecipeGroupingService"
```

---

### Task 2: Wire grouping into submitForReview

**Files:**
- Modify: `api/src/recipes/schemas/recipe.schema.ts`
- Modify: `api/src/recipes/recipes.module.ts`
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`

**Interfaces:**
- Consumes: `RecipeGroupingService.assignGroup` from Task 1.
- Produces (used by Task 3 frontend): `recipe.dishGroupId`/`dishGroupName`/`dishGroupNameHe` fields, populated on every successful publish.

- [ ] **Step 1: Add the new schema fields**

In `api/src/recipes/schemas/recipe.schema.ts`, insert this block right after the existing `batchId?: string` property, before the class's closing `}`:

```typescript

  // Denormalized dish-group assignment, set on every successful publish by
  // RecipeGroupingService - avoids a join/new endpoint for the browsing
  // screen's "group same dish" toggle. dishGroupId alone isn't enough to
  // render a group card without a second query, so the name comes along.
  @Prop({ index: true })
  dishGroupId?: string

  @Prop()
  dishGroupName?: string

  @Prop()
  dishGroupNameHe?: string
```

- [ ] **Step 2: Register DishGroup and RecipeGroupingService in RecipesModule**

In `api/src/recipes/recipes.module.ts`, add the imports:

```typescript
import { DishGroup, DishGroupSchema } from './schemas/dish-group.schema'
import { RecipeGroupingService } from './grouping/recipe-grouping.service'
```

Add `{ name: DishGroup.name, schema: DishGroupSchema }` to the `MongooseModule.forFeature([...])` array (alongside `Recipe`/`RecipeRevision`/`Rating`):

```typescript
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: RecipeRevision.name, schema: RecipeRevisionSchema },
      { name: Rating.name, schema: RatingSchema },
      { name: DishGroup.name, schema: DishGroupSchema },
    ]),
```

Add `RecipeGroupingService` to the `providers` array:

```typescript
  providers: [RecipesService, RecipeImportService, NutritionService, RecipeAiGenerateService, RecipeQualityService, RecipeSimilarityService, RecipeGroupingService],
```

- [ ] **Step 3: Write the failing tests for the submitForReview integration**

In `api/src/recipes/recipes.service.spec.ts`, add the import:

```typescript
import { RecipeGroupingService } from './grouping/recipe-grouping.service'
```

Add a `makeGroupingService` helper next to the existing `makeSimilarityService` helper:

```typescript
  function makeGroupingService(group: Record<string, unknown> = { id: 'group-1', name: 'Test Dish', nameHe: undefined }) {
    return { assignGroup: jest.fn().mockResolvedValue(group) }
  }
```

Extend `makeService`'s signature and providers array to accept and wire an 11th parameter:

```typescript
  async function makeService(
    recipeModel: Record<string, unknown>,
    revisionModel: Record<string, unknown> = noRevisionFound(),
    ratingModel: Record<string, unknown> = { aggregate: jest.fn().mockResolvedValue([]) },
    activityLog = makeActivityLog(),
    cookLog = makeCookLog(),
    config: Record<string, unknown> = { get: jest.fn().mockReturnValue('owner_1') },
    usersService = makeUsers(),
    qualityService = makeQualityService(),
    similarityService = makeSimilarityService(),
    groupingService = makeGroupingService(),
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: getModelToken(RecipeRevision.name), useValue: revisionModel },
        { provide: getModelToken(Rating.name), useValue: ratingModel },
        { provide: ActivityLogService, useValue: activityLog },
        { provide: CookLogService, useValue: cookLog },
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: config },
        { provide: RecipeQualityService, useValue: qualityService },
        { provide: RecipeSimilarityService, useValue: similarityService },
        { provide: RecipeGroupingService, useValue: groupingService },
      ],
    }).compile()
    return moduleRef.get(RecipesService)
  }
```

(Keep the rest of `makeService`'s body unchanged.)

Add these two tests right after the existing `'submitForReview publishes immediately when the AI review score meets the threshold'` test:

```typescript
  it('submitForReview assigns a dish group when it publishes', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const updateOne = jest.fn().mockResolvedValue({})
    const quality = makeQualityService({ score: 95, checkedAt: 'now', findings: [] })
    const grouping = makeGroupingService({ id: 'group-1', name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
    const service = await makeService({ findOne }, { updateOne }, undefined, undefined, undefined, undefined, undefined, quality, undefined, grouping)

    await service.submitForReview('a', 'user_1', false)

    expect(grouping.assignGroup).toHaveBeenCalledWith(recipe)
    expect(recipe.dishGroupId).toBe('group-1')
    expect(recipe.dishGroupName).toBe('Caprese Salad')
    expect(recipe.dishGroupNameHe).toBe('סלט קפרזה')
  })

  it('submitForReview does not assign a dish group when the score is below the threshold', async () => {
    const recipe: any = completeRecipe()
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(recipe), select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis() })
    const quality = makeQualityService({ score: 40, checkedAt: 'now', findings: [] })
    const grouping = makeGroupingService()
    const service = await makeService({ findOne }, undefined, undefined, undefined, undefined, undefined, undefined, quality, undefined, grouping)

    await service.submitForReview('a', 'user_1', false)

    expect(grouping.assignGroup).not.toHaveBeenCalled()
    expect(recipe.dishGroupId).toBeUndefined()
  })
```

Note: the `undefined` in the 9th positional slot of `makeService(...)` (between `quality` and `grouping`) intentionally falls back to `makeSimilarityService()`'s default (zero candidates), so these tests exercise the plain quality-review path unaffected by duplicate detection.

- [ ] **Step 4: Run tests to verify the new ones fail**

Run: `cd api && npx jest src/recipes/recipes.service.spec.ts -t "dish group"`
Expected: FAIL — `RecipesService` constructor doesn't yet accept a `RecipeGroupingService`, and `submitForReview` doesn't yet call it.

- [ ] **Step 5: Wire RecipeGroupingService into RecipesService**

In `api/src/recipes/recipes.service.ts`, add the import:

```typescript
import { RecipeGroupingService } from './grouping/recipe-grouping.service'
```

Add `groupingService` to the constructor (after the existing `similarityService` param):

```typescript
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(RecipeRevision.name) private readonly revisionModel: Model<RecipeRevisionDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
    private readonly activityLogService: ActivityLogService,
    private readonly cookLogService: CookLogService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly qualityService: RecipeQualityService,
    private readonly similarityService: RecipeSimilarityService,
    private readonly groupingService: RecipeGroupingService,
  ) {}
```

In `submitForReview`'s publish-success branch, add the grouping call right before `await recipe.save()`. The branch currently reads:

```typescript
    if (review.score >= RecipesService.PUBLISH_THRESHOLD) {
      await this.revisionModel.updateOne(
        { recipeId: id, revisionNumber: recipe.currentRevision },
        { $set: { published: true } },
      )
      recipe.publishedRevision = recipe.currentRevision
      recipe.status = 'published'
      recipe.pendingReview = false
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_published')
    } else {
```

Change it to:

```typescript
    if (review.score >= RecipesService.PUBLISH_THRESHOLD) {
      await this.revisionModel.updateOne(
        { recipeId: id, revisionNumber: recipe.currentRevision },
        { $set: { published: true } },
      )
      recipe.publishedRevision = recipe.currentRevision
      recipe.status = 'published'
      recipe.pendingReview = false
      recipe.reviewComment = undefined
      recipe.qualityReview = review
      const group = await this.groupingService.assignGroup(recipe)
      recipe.dishGroupId = group.id
      recipe.dishGroupName = group.name
      recipe.dishGroupNameHe = group.nameHe
      await recipe.save()
      await this.activityLogService.record(userId, id, 'recipe_published')
      await this.activityLogService.record(userId, id, 'recipe_dish_group_assigned', { dishGroupId: group.id })
    } else {
```

Leave the `else` branch (rejection) completely unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd api && npx jest src/recipes/recipes.service.spec.ts`
Expected: PASS, all tests green (existing + 2 new dish-group ones). If any pre-existing test fails, it's because it asserts the full shape of `recipe` after publishing (e.g. via `toEqual`) rather than individual fields - check for that pattern and, if found, add the new `dishGroupId`/`dishGroupName`/`dishGroupNameHe` fields to that assertion's expected object (using the default `makeGroupingService()` values: `{ id: 'group-1', name: 'Test Dish', nameHe: undefined }`).

- [ ] **Step 7: Run the full backend suite**

Run: `cd api && npx jest --silent`
Expected: PASS, all suites green

- [ ] **Step 8: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/schemas/recipe.schema.ts api/src/recipes/recipes.module.ts api/src/recipes/recipes.service.ts api/src/recipes/recipes.service.spec.ts
git commit -m "feat: assign a dish group to every recipe on publish"
```

---

### Task 3: Frontend data layer (types, i18n)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/i18n.ts`

**Interfaces:**
- Produces (used by Tasks 4-5): `Recipe.dishGroupId`/`dishGroupName`/`dishGroupNameHe` fields; the `tx.*` i18n keys listed in Step 2.

- [ ] **Step 1: Add the new fields to the Recipe type**

In `src/types.ts`, add these fields to the `Recipe` interface, right after `batchId?: string` (the last field before the closing `}`):

```typescript
  dishGroupId?: string
  dishGroupName?: string
  dishGroupNameHe?: string
```

- [ ] **Step 2: Add the new i18n keys**

In `src/i18n.ts`, insert these keys as the last entries of the `he` object — immediately before the closing `},` on the line right after `disputeApprovedIntro: 'ניתן להגיש שוב לבדיקה.',` (currently line 441):

```typescript
      groupSameDish: 'קבץ מנות זהות',
      dishGroupCount: (n: number) => `${n} מתכונים`,
      dishGroupTapToSeeAll: 'הקישו לצפייה בכל המתכונים',
      showingDishGroup: (name: string, count: number) => `מציג את קבוצת "${name}" (${count} מתכונים)`,
      clearGroupFilter: 'נקה קבוצה',
```

Insert these keys as the last entries of the `en` object — immediately before the closing `},` on the line right after `disputeApprovedIntro: 'You can submit for review again.',` (currently line 847):

```typescript
    groupSameDish: 'Group same dish',
    dishGroupCount: (n: number) => `${n} recipes`,
    dishGroupTapToSeeAll: 'Tap to see all recipes',
    showingDishGroup: (name: string, count: number) => `Showing "${name}" (${count} recipes)`,
    clearGroupFilter: 'Clear group',
```

- [ ] **Step 3: Verify the frontend builds and type-checks**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/types.ts src/i18n.ts
git commit -m "feat: add frontend types/i18n for dish grouping"
```

---

### Task 4: VirtualRecipeGrid generalization + GroupCard component

**Files:**
- Modify: `src/components/VirtualRecipeGrid.tsx`
- Create: `src/components/GroupCard.tsx`

**Interfaces:**
- Consumes: `Recipe.dishGroupId`/`dishGroupName`/`dishGroupNameHe` from Task 3.
- Produces (used by Task 5): the exported `DishGroupSummary` and `GridItem` types from `VirtualRecipeGrid.tsx`, and `VirtualRecipeGrid`'s new prop contract:
  ```typescript
  interface VirtualRecipeGridProps {
    items: GridItem[]
    searchQuery: string
    favoriteSlugs: Set<string>
    onToggleFavorite: (slug: string) => void
    onSelectGroup: (groupId: string) => void
    statusBadgeFor?: (recipe: Recipe) => { label: string; className: string } | undefined
    editableFor?: (recipe: Recipe) => boolean
  }
  ```

`VirtualRecipeGrid` is only used by `Home.tsx` in this repo (confirmed via `grep -rl VirtualRecipeGrid src/components`), so its prop contract can change freely without touching any other call site.

- [ ] **Step 1: Create the GroupCard component**

Create `src/components/GroupCard.tsx`:

```typescript
import { motion } from 'framer-motion'
import type { DishGroupSummary } from './VirtualRecipeGrid'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'

interface GroupCardProps {
  group: DishGroupSummary
  index: number
  onSelect: (groupId: string) => void
  imageLoading?: 'eager' | 'lazy'
}

export default function GroupCard({ group, index, onSelect, imageLoading }: GroupCardProps) {
  const { lang } = useLanguage()
  const tx = t[lang]
  const name = (lang === 'he' ? group.nameHe : group.name) ?? group.name
  const thumbs = group.previewRecipes.slice(0, 4)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className="h-full"
    >
      <button type="button" onClick={() => onSelect(group.id)} className="block group h-full w-full text-start">
        <div className="card overflow-hidden h-full flex flex-col">
          <div className="relative h-52 sm:h-60 overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5">
            {thumbs.map(recipe => (
              recipe.image?.includes('assets.tugy.dev') ? (
                <SkeletonImage
                  key={recipe.id}
                  src={resizedImage(recipe.image, 320)}
                  alt={name}
                  className="w-full h-full object-cover"
                  loading={imageLoading ?? 'lazy'}
                />
              ) : (
                <div key={recipe.id} className="w-full h-full bg-tint/[0.06]" />
              )
            ))}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1 h-7 px-2.5 rounded-full backdrop-blur-sm border bg-black/30 border-white/20 text-white/80 text-xs font-medium">
                {tx.dishGroupCount(group.count)}
              </span>
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col">
            <h3 className="font-serif text-lg font-medium text-cream group-hover:text-amber transition-colors">
              {name}
            </h3>
            <p className="text-xs text-cream/40 mt-1">{tx.dishGroupTapToSeeAll}</p>
          </div>
        </div>
      </button>
    </motion.div>
  )
}
```

- [ ] **Step 2: Rewrite VirtualRecipeGrid to accept GridItem[] instead of Recipe[]**

Replace the entire contents of `src/components/VirtualRecipeGrid.tsx` with:

```typescript
import { useCallback, useMemo, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { Recipe } from '../types'
import { useGridColumns } from '../hooks/useGridColumns'
import RecipeCard from './RecipeCard'
import GroupCard from './GroupCard'

export interface DishGroupSummary {
  id: string
  name: string
  nameHe?: string
  count: number
  previewRecipes: Recipe[]
}

export type GridItem =
  | { type: 'recipe'; recipe: Recipe }
  | { type: 'group'; group: DishGroupSummary }

interface VirtualRecipeGridProps {
  items: GridItem[]
  searchQuery: string
  favoriteSlugs: Set<string>
  onToggleFavorite: (slug: string) => void
  onSelectGroup: (groupId: string) => void
  statusBadgeFor?: (recipe: Recipe) => { label: string; className: string } | undefined
  editableFor?: (recipe: Recipe) => boolean
}

const ROW_GAP = 16 // matches `gap-4`
const ESTIMATED_ROW_HEIGHT = 360

function itemKey(item: GridItem): string {
  return item.type === 'recipe' ? item.recipe.id : `group-${item.group.id}`
}

export default function VirtualRecipeGrid({
  items, searchQuery, favoriteSlugs, onToggleFavorite, onSelectGroup, statusBadgeFor, editableFor,
}: VirtualRecipeGridProps) {
  const columns = useGridColumns()
  const [parentOffset, setParentOffset] = useState(0)
  // Measured from a callback ref (not an effect) so the virtualizer's
  // scrollMargin is correct as soon as the grid mounts.
  const parentRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setParentOffset(node.offsetTop)
  }, [])

  const rows = useMemo(() => {
    const chunks: GridItem[][] = []
    for (let i = 0; i < items.length; i += columns) {
      chunks.push(items.slice(i, i + columns))
    }
    return chunks
  }, [items, columns])

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT + ROW_GAP,
    overscan: 3,
    scrollMargin: parentOffset,
    // Rows change size in Hebrew/English and with badges - remeasure real DOM height.
    getItemKey: i => { const first = rows[i]?.[0]; return first ? itemKey(first) : i },
  })

  const gridColsClass = columns === 3 ? 'grid-cols-3' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1'

  return (
    <div ref={parentRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(virtualRow => {
        const row = rows[virtualRow.index]
        if (!row) return null
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              paddingBottom: ROW_GAP,
            }}
          >
            <div className={`grid ${gridColsClass} gap-4`}>
              {row.map((item, colIndex) => (
                item.type === 'recipe' ? (
                  <RecipeCard
                    key={item.recipe.id}
                    recipe={item.recipe}
                    index={colIndex}
                    searchQuery={searchQuery}
                    isFavorite={favoriteSlugs.has(item.recipe.id)}
                    onToggleFavorite={onToggleFavorite}
                    statusBadge={statusBadgeFor?.(item.recipe)}
                    editable={editableFor?.(item.recipe)}
                    imageLoading={virtualRow.index === 0 ? 'eager' : 'lazy'}
                    imageFetchPriority={virtualRow.index === 0 && colIndex === 0 ? 'high' : 'auto'}
                  />
                ) : (
                  <GroupCard
                    key={item.group.id}
                    group={item.group}
                    index={colIndex}
                    onSelect={onSelectGroup}
                    imageLoading={virtualRow.index === 0 ? 'eager' : 'lazy'}
                  />
                )
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: this will FAIL at this point, because `Home.tsx` still calls `<VirtualRecipeGrid recipes={filtered} .../>` with the old prop shape - that's expected, Task 5 fixes the call site. Confirm the error is specifically about `Home.tsx`'s call site (missing `items`/`onSelectGroup` props, unknown `recipes` prop) and not about `VirtualRecipeGrid.tsx` or `GroupCard.tsx` themselves.

- [ ] **Step 4: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/VirtualRecipeGrid.tsx src/components/GroupCard.tsx
git commit -m "feat: generalize VirtualRecipeGrid to render dish-group cards"
```

---

### Task 5: Home.tsx toggle, grouping computation, and group filter

**Files:**
- Modify: `src/components/Home.tsx`

**Interfaces:**
- Consumes: `GridItem`/`DishGroupSummary` types and the new `VirtualRecipeGrid` props from Task 4; `Recipe.dishGroupId`/`dishGroupName`/`dishGroupNameHe` from Task 3; `tx.groupSameDish`/`tx.dishGroupCount`/`tx.showingDishGroup`/`tx.clearGroupFilter` i18n keys from Task 3.

- [ ] **Step 1: Add the new URL-synced state**

In `src/components/Home.tsx`, add the import for the new type (alongside the existing `VirtualRecipeGrid` import):

```typescript
import VirtualRecipeGrid, { type GridItem } from './VirtualRecipeGrid'
```

Add two new pieces of state right after the existing `const [sortBy, setSortBy] = useState<SortOption>(...)` line:

```typescript
  const [groupByDish, setGroupByDish] = useState(() => searchParams.get('grouped') === '1')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => searchParams.get('group'))
```

Update the URL-sync `useEffect` (the one that builds `next` and calls `setSearchParams`) to also persist these two, and add them to its dependency array:

```typescript
  useEffect(() => {
    const next = new URLSearchParams()
    if (search.trim()) next.set('q', search.trim())
    if (activeCategory) next.set('category', activeCategory)
    if (activeDifficulty) next.set('diff', activeDifficulty)
    if (activeDietary) next.set('diet', activeDietary)
    if (activeKosher) next.set('kosher', activeKosher)
    if (showFavoritesOnly) next.set('fav', '1')
    if (sortBy !== 'default') next.set('sort', sortBy)
    if (groupByDish) next.set('grouped', '1')
    if (activeGroupId) next.set('group', activeGroupId)
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeCategory, activeDifficulty, activeDietary, activeKosher, showFavoritesOnly, sortBy, groupByDish, activeGroupId])
```

- [ ] **Step 2: Apply the group filter inside the existing `filtered` memo**

In the `filtered` `useMemo` in `Home.tsx`, add the group filter right after the existing `if (activeKosher) list = list.filter(...)` line:

```typescript
    if (activeKosher) list = list.filter(r => r.kosherType === activeKosher)
    if (activeGroupId) list = list.filter(r => r.dishGroupId === activeGroupId)
```

Add `activeGroupId` to that `useMemo`'s dependency array (append it to the existing array: `[search, activeCategory, activeDifficulty, activeDietary, activeKosher, lang, recipes, showFavoritesOnly, favoriteSlugs, sortBy, activeGroupId]`).

- [ ] **Step 3: Compute the grid items**

Add this new `useMemo` right after the `filtered` `useMemo` block:

```typescript
  const gridItems = useMemo<GridItem[]>(() => {
    if (activeGroupId || !groupByDish) {
      return filtered.map(recipe => ({ type: 'recipe', recipe }) as GridItem)
    }
    const byGroup = new Map<string, typeof filtered>()
    for (const recipe of filtered) {
      if (!recipe.dishGroupId) continue
      const list = byGroup.get(recipe.dishGroupId) ?? []
      list.push(recipe)
      byGroup.set(recipe.dishGroupId, list)
    }
    const seenGroups = new Set<string>()
    const items: GridItem[] = []
    for (const recipe of filtered) {
      const members = recipe.dishGroupId ? byGroup.get(recipe.dishGroupId) : undefined
      if (members && members.length >= 2 && recipe.dishGroupId) {
        if (seenGroups.has(recipe.dishGroupId)) continue
        seenGroups.add(recipe.dishGroupId)
        items.push({
          type: 'group',
          group: {
            id: recipe.dishGroupId,
            name: recipe.dishGroupName ?? recipe.title,
            nameHe: recipe.dishGroupNameHe,
            count: members.length,
            previewRecipes: members.slice(0, 4),
          },
        })
      } else {
        items.push({ type: 'recipe', recipe })
      }
    }
    return items
  }, [filtered, groupByDish, activeGroupId])
```

- [ ] **Step 4: Add the toggle button next to the sort dropdown**

In the JSX, find the block:

```tsx
          <AppSelect
            value={sortBy}
            onValueChange={value => setSortBy(value as SortOption)}
            triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg text-xs text-cream/60 px-2.5 py-1.5 outline-none hover:bg-tint/[0.06] transition-colors"
            options={[
              { value: 'default', label: tx.defaultOrder },
              { value: 'rating', label: tx.topRated },
              { value: 'quickest', label: tx.quickest },
              { value: 'newest', label: tx.newest },
            ]}
          />
        </div>
```

Replace it with (adding the toggle button before the closing `</div>`):

```tsx
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => setGroupByDish(v => !v)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                groupByDish
                  ? 'text-amber bg-amber/10 border-amber/20'
                  : 'text-cream/40 hover:text-cream/70 border-tint/10'
              }`}
            >
              {tx.groupSameDish}
            </button>
            <AppSelect
              value={sortBy}
              onValueChange={value => setSortBy(value as SortOption)}
              triggerClassName="bg-tint/[0.03] border border-tint/10 rounded-lg text-xs text-cream/60 px-2.5 py-1.5 outline-none hover:bg-tint/[0.06] transition-colors"
              options={[
                { value: 'default', label: tx.defaultOrder },
                { value: 'rating', label: tx.topRated },
                { value: 'quickest', label: tx.quickest },
                { value: 'newest', label: tx.newest },
              ]}
            />
          </div>
        </div>
```

- [ ] **Step 5: Add the active-group banner**

Right after that same closing `</div>` (the one that ends the `flex items-center justify-between mb-5` row), and before the `{loading ? (` conditional, add:

```tsx
        {activeGroupId && (() => {
          const groupRecipe = recipes.find(r => r.dishGroupId === activeGroupId)
          const name = (lang === 'he' ? groupRecipe?.dishGroupNameHe : groupRecipe?.dishGroupName) ?? groupRecipe?.dishGroupName ?? ''
          return (
            <div className="flex items-center gap-3 mb-4 text-xs text-cream/50">
              <span>{tx.showingDishGroup(name, filtered.length)}</span>
              <button type="button" onClick={() => setActiveGroupId(null)} className="text-amber hover:text-amber/80 transition-colors">
                {tx.clearGroupFilter}
              </button>
            </div>
          )
        })()}

```

- [ ] **Step 6: Update the VirtualRecipeGrid call site**

Replace:

```tsx
          <VirtualRecipeGrid
            recipes={filtered}
            searchQuery={search}
            favoriteSlugs={favoriteSlugs}
            onToggleFavorite={toggleFavorite}
          />
```

with:

```tsx
          <VirtualRecipeGrid
            items={gridItems}
            searchQuery={search}
            favoriteSlugs={favoriteSlugs}
            onToggleFavorite={toggleFavorite}
            onSelectGroup={groupId => setActiveGroupId(groupId)}
          />
```

- [ ] **Step 7: Verify the frontend builds**

Run: `cd /Users/tugy/git/recipes && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 8: Run the react-hooks lint check (matches the CI gate)**

Run:
```bash
cd /Users/tugy/git/recipes
npx eslint 'src/**/*.{ts,tsx}' --format json > /tmp/eslint-report.json
node -e "
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('/tmp/eslint-report.json', 'utf8'));
const hookIssues = results.flatMap(r => r.messages.filter(m => m.ruleId && m.ruleId.startsWith('react-hooks/')).map(m => ({ file: r.filePath, line: m.line, message: m.message })));
if (hookIssues.length > 0) { console.error('React Hooks rule violations found:'); console.error(JSON.stringify(hookIssues, null, 2)); process.exit(1); }
console.log('No react-hooks violations found.');
"
```
Expected: `No react-hooks violations found.`

- [ ] **Step 9: Manually verify in the browser**

Run: `cd /Users/tugy/git/recipes && npm run dev` (if not already running). Since no recipe in seed/dev data will have `dishGroupId` set yet (grouping only happens on a fresh publish going through Task 2's flow), the "group same dish" toggle will show the exact same grid as before when clicked - confirm the toggle button itself renders correctly, is clickable, and doesn't error, rather than expecting to see an actual group card (there's nothing to group yet in existing data).

- [ ] **Step 10: Commit**

```bash
cd /Users/tugy/git/recipes
git add src/components/Home.tsx
git commit -m "feat: add group-same-dish toggle and group filter to Home"
```

---

## Self-Review Notes

- **Spec coverage:** DishGroup collection + denormalized Recipe fields (Task 1/2), AI assignment with specificity instruction and hallucination fallback (Task 1), wiring into the publish branch (Task 2), toggle + collapsing + click-through filter (Tasks 3-5). "Out of Scope" items (group admin tooling, dedicated browse page, duplicate-detection interaction) are untouched.
- **Type consistency:** `AssignedGroup` (Task 1) matches what Task 2's `submitForReview` destructures (`group.id`/`group.name`/`group.nameHe`). `DishGroupSummary`/`GridItem` (Task 4) match exactly what Task 5's `gridItems` memo constructs and what `GroupCard` consumes.
- **No placeholders:** every step has literal code, not descriptions.
