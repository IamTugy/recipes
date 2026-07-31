# Favorites + Ratings + Sharing + Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement directly task-by-task in-session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add favorites and 1-5 ratings (backend + frontend), a zero-backend share button, and an editorial-cookbook visual pass on Home/RecipeCard/RecipeDetail/Nav.

**Architecture:** Extend the existing `favorites`/`ratings` NestJS modules with controllers on top of their sub-project-1 schemas. Extend `RecipesService` with a Mongo aggregation for average rating/count. Frontend gets `useFavorites`/`useRatings` hooks mirroring `useRecipes`'s auth-aware fetch pattern, plus visual enhancements to existing components.

**Tech Stack:** NestJS/Mongoose (existing), React/Tailwind/Framer Motion (existing) — no new dependencies.

## Global Constraints

- Every new endpoint inherits the global Clerk auth guard — no `@Public()` needed, no new auth logic.
- Favorite/rating toggle must call `ActivityLogService.record` (existing service, no changes to it).
- `recipeSlug`/`userId` uniqueness is already enforced by sub-project 1's Mongo indexes — controllers must upsert, not blind-insert.
- No new frontend test framework — manual verification via the running app, matching the existing posture.
- Sharing needs zero backend changes — verify the `<SignIn/>` in-place-render assumption from the spec holds before building on it.

---

### Task 1: Favorites controller

**Files:**
- Create: `api/src/favorites/favorites.controller.ts`
- Create: `api/src/favorites/favorites.controller.spec.ts`
- Create: `api/src/favorites/favorites.service.ts`
- Create: `api/src/favorites/favorites.service.spec.ts`
- Modify: `api/src/favorites/favorites.module.ts`

**Interfaces:**
- Produces: `GET /favorites` → `string[]` (slugs), `POST /favorites/:slug` → `{ favorited: true }`, `DELETE /favorites/:slug` → `{ favorited: false }`.

- [ ] **Step 1: Write the failing test `api/src/favorites/favorites.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { FavoritesService } from './favorites.service'
import { Favorite } from './schemas/favorite.schema'

describe('FavoritesService', () => {
  const findOneAndUpdate = jest.fn()
  const deleteOne = jest.fn()
  const find = jest.fn()

  const model = { findOneAndUpdate, deleteOne, find }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [FavoritesService, { provide: getModelToken(Favorite.name), useValue: model }],
    }).compile()
    return moduleRef.get(FavoritesService)
  }

  it('add upserts a favorite by userId+recipeSlug', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.add('user_1', 'a')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeSlug: 'a' },
      { userId: 'user_1', recipeSlug: 'a' },
      { upsert: true },
    )
  })

  it('remove deletes the favorite by userId+recipeSlug', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.remove('user_1', 'a')
    expect(deleteOne).toHaveBeenCalledWith({ userId: 'user_1', recipeSlug: 'a' })
  })

  it('listSlugs returns the recipeSlug of every favorite for a user', async () => {
    find.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ recipeSlug: 'a' }, { recipeSlug: 'b' }]) })
    const service = await makeService()
    await expect(service.listSlugs('user_1')).resolves.toEqual(['a', 'b'])
    expect(find).toHaveBeenCalledWith({ userId: 'user_1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npm test -- favorites.service.spec.ts`
Expected: FAIL (`Cannot find module './favorites.service'`)

- [ ] **Step 3: Create `api/src/favorites/favorites.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Favorite, FavoriteDocument } from './schemas/favorite.schema'

@Injectable()
export class FavoritesService {
  constructor(@InjectModel(Favorite.name) private readonly favoriteModel: Model<FavoriteDocument>) {}

  async add(userId: string, recipeSlug: string): Promise<void> {
    await this.favoriteModel
      .findOneAndUpdate({ userId, recipeSlug }, { userId, recipeSlug }, { upsert: true })
      .exec()
  }

  async remove(userId: string, recipeSlug: string): Promise<void> {
    await this.favoriteModel.deleteOne({ userId, recipeSlug }).exec()
  }

  async listSlugs(userId: string): Promise<string[]> {
    const favorites = await this.favoriteModel.find({ userId }).exec()
    return favorites.map(f => f.recipeSlug)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npm test -- favorites.service.spec.ts`
Expected: PASS (3 cases)

- [ ] **Step 5: Write the failing test `api/src/favorites/favorites.controller.spec.ts`**

```ts
import { FavoritesController } from './favorites.controller'

describe('FavoritesController', () => {
  const favoritesService = { add: jest.fn(), remove: jest.fn(), listSlugs: jest.fn() }
  const activityLog = { record: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('GET /favorites returns the current user\'s favorite slugs', async () => {
    favoritesService.listSlugs.mockResolvedValue(['a', 'b'])
    const controller = new FavoritesController(favoritesService as any, activityLog as any)
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual(['a', 'b'])
  })

  it('POST /favorites/:slug adds the favorite and logs the action', async () => {
    const controller = new FavoritesController(favoritesService as any, activityLog as any)
    const result = await controller.add('a', { userId: 'user_1' } as any)
    expect(favoritesService.add).toHaveBeenCalledWith('user_1', 'a')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'favorited')
    expect(result).toEqual({ favorited: true })
  })

  it('DELETE /favorites/:slug removes the favorite and logs the action', async () => {
    const controller = new FavoritesController(favoritesService as any, activityLog as any)
    const result = await controller.remove('a', { userId: 'user_1' } as any)
    expect(favoritesService.remove).toHaveBeenCalledWith('user_1', 'a')
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'unfavorited')
    expect(result).toEqual({ favorited: false })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd api && npm test -- favorites.controller.spec.ts`
Expected: FAIL (`Cannot find module './favorites.controller'`)

- [ ] **Step 7: Create `api/src/favorites/favorites.controller.ts`**

```ts
import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { FavoritesService } from './favorites.service'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('favorites')
export class FavoritesController {
  constructor(
    private readonly favoritesService: FavoritesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.favoritesService.listSlugs(req.userId)
  }

  @Post(':slug')
  async add(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.favoritesService.add(req.userId, slug)
    await this.activityLog.record(req.userId, slug, 'favorited')
    return { favorited: true }
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.favoritesService.remove(req.userId, slug)
    await this.activityLog.record(req.userId, slug, 'unfavorited')
    return { favorited: false }
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd api && npm test -- favorites.controller.spec.ts`
Expected: PASS (3 cases)

- [ ] **Step 9: Wire into `api/src/favorites/favorites.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Favorite, FavoriteSchema } from './schemas/favorite.schema'
import { FavoritesService } from './favorites.service'
import { FavoritesController } from './favorites.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Favorite.name, schema: FavoriteSchema }]),
    ActivityLogModule,
  ],
  providers: [FavoritesService],
  controllers: [FavoritesController],
})
export class FavoritesModule {}
```

- [ ] **Step 10: Run full suite and commit**

Run: `cd api && npm test && npm run build`

```bash
git add api/src/favorites
git commit -m "feat(api): add favorites controller with toggle + list endpoints"
```

---

### Task 2: Ratings controller + recipe aggregation

**Files:**
- Create: `api/src/ratings/ratings.controller.ts`
- Create: `api/src/ratings/ratings.controller.spec.ts`
- Create: `api/src/ratings/ratings.service.ts`
- Create: `api/src/ratings/ratings.service.spec.ts`
- Create: `api/src/ratings/dto/rate-recipe.dto.ts`
- Modify: `api/src/ratings/ratings.module.ts`
- Modify: `api/src/recipes/recipes.service.ts`
- Modify: `api/src/recipes/recipes.service.spec.ts`
- Modify: `api/src/recipes/recipes.module.ts`

**Interfaces:**
- Produces: `PUT /ratings/:slug` body `{ score: 1-5 }` → `{ score: number }`. `RecipesService.findAll()`/`findBySlug()` now return objects with `averageRating: number | null` and `ratingCount: number` attached.

- [ ] **Step 1: Write the failing test `api/src/ratings/ratings.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RatingsService } from './ratings.service'
import { Rating } from './schemas/rating.schema'

describe('RatingsService', () => {
  it('rate upserts the user\'s score for a recipe', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ score: 4 }) })
    const moduleRef = await Test.createTestingModule({
      providers: [RatingsService, { provide: getModelToken(Rating.name), useValue: { findOneAndUpdate } }],
    }).compile()

    const service = moduleRef.get(RatingsService)
    const result = await service.rate('user_1', 'a', 4)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeSlug: 'a' },
      { userId: 'user_1', recipeSlug: 'a', score: 4 },
      { upsert: true, new: true },
    )
    expect(result).toEqual({ score: 4 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npm test -- ratings.service.spec.ts`
Expected: FAIL (`Cannot find module './ratings.service'`)

- [ ] **Step 3: Create `api/src/ratings/ratings.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rating, RatingDocument } from './schemas/rating.schema'

@Injectable()
export class RatingsService {
  constructor(@InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>) {}

  async rate(userId: string, recipeSlug: string, score: number): Promise<{ score: number }> {
    const doc = await this.ratingModel
      .findOneAndUpdate(
        { userId, recipeSlug },
        { userId, recipeSlug, score },
        { upsert: true, new: true },
      )
      .exec()
    return { score: doc!.score }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npm test -- ratings.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Create `api/src/ratings/dto/rate-recipe.dto.ts`**

```ts
import { IsInt, Max, Min } from 'class-validator'

export class RateRecipeDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number
}
```

Note: this requires `class-validator` and `class-transformer`, which are NestJS-standard but not yet in `api/package.json`. Add them as dependencies (`"class-validator": "^0.14.1"`, `"class-transformer": "^0.5.1"`) and run `npm install` before continuing. A global `ValidationPipe` must also be enabled in `api/src/main.ts` — add `app.useGlobalPipes(new ValidationPipe())` (import `ValidationPipe` from `@nestjs/common`) right after `NestFactory.create`, if not already present.

- [ ] **Step 6: Write the failing test `api/src/ratings/ratings.controller.spec.ts`**

```ts
import { RatingsController } from './ratings.controller'

describe('RatingsController', () => {
  const ratingsService = { rate: jest.fn() }

  it('PUT /ratings/:slug rates the recipe as the current user', async () => {
    ratingsService.rate.mockResolvedValue({ score: 5 })
    const controller = new RatingsController(ratingsService as any)
    const result = await controller.rate('a', { score: 5 }, { userId: 'user_1' } as any)
    expect(ratingsService.rate).toHaveBeenCalledWith('user_1', 'a', 5)
    expect(result).toEqual({ score: 5 })
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd api && npm test -- ratings.controller.spec.ts`
Expected: FAIL (`Cannot find module './ratings.controller'`)

- [ ] **Step 8: Create `api/src/ratings/ratings.controller.ts`**

```ts
import { Body, Controller, Param, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RatingsService } from './ratings.service'
import { RateRecipeDto } from './dto/rate-recipe.dto'

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Put(':slug')
  async rate(
    @Param('slug') slug: string,
    @Body() body: RateRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.ratingsService.rate(req.userId, slug, body.score)
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd api && npm test -- ratings.controller.spec.ts`
Expected: PASS

- [ ] **Step 10: Wire into `api/src/ratings/ratings.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rating, RatingSchema } from './schemas/rating.schema'
import { RatingsService } from './ratings.service'
import { RatingsController } from './ratings.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Rating.name, schema: RatingSchema }])],
  providers: [RatingsService],
  controllers: [RatingsController],
})
export class RatingsModule {}
```

- [ ] **Step 11: Write the failing test for the aggregation — extend `api/src/recipes/recipes.service.spec.ts`**

Add this case to the existing `describe('RecipesService', ...)` block:

```ts
  it('findAll attaches averageRating and ratingCount from the ratings collection', async () => {
    const recipesExec = jest.fn().mockResolvedValue([{ slug: 'a', toObject: () => ({ slug: 'a' }) }])
    const find = jest.fn().mockReturnValue({ exec: recipesExec })
    const aggregate = jest.fn().mockResolvedValue([{ _id: 'a', avg: 4.5, count: 2 }])
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: getModelToken(Recipe.name), useValue: { find, findOne: jest.fn() } },
        { provide: getModelToken(Rating.name), useValue: { aggregate } },
      ],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findAll()

    expect(result[0]).toMatchObject({ slug: 'a', averageRating: 4.5, ratingCount: 2 })
  })
```

Add the import `import { Rating } from '../ratings/schemas/rating.schema'` to the top of the spec file.

- [ ] **Step 12: Run test to verify it fails**

Run: `cd api && npm test -- recipes.service.spec.ts`
Expected: FAIL (new case throws — `Rating` model not injected, `averageRating` undefined)

- [ ] **Step 13: Update `api/src/recipes/recipes.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from './schemas/recipe.schema'
import { Rating, RatingDocument } from '../ratings/schemas/rating.schema'

interface RatingAggregate {
  _id: string
  avg: number
  count: number
}

@Injectable()
export class RecipesService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
  ) {}

  private async ratingsBySlug(slugs: string[]): Promise<Map<string, { avg: number; count: number }>> {
    const aggregates = (await this.ratingModel.aggregate([
      { $match: { recipeSlug: { $in: slugs } } },
      { $group: { _id: '$recipeSlug', avg: { $avg: '$score' }, count: { $sum: 1 } } },
    ])) as RatingAggregate[]

    return new Map(aggregates.map(a => [a._id, { avg: a.avg, count: a.count }]))
  }

  private attachRatings<T extends { slug: string }>(
    recipes: T[],
    ratings: Map<string, { avg: number; count: number }>,
  ) {
    return recipes.map(recipe => {
      const rating = ratings.get(recipe.slug)
      return {
        ...recipe,
        averageRating: rating ? Math.round(rating.avg * 10) / 10 : null,
        ratingCount: rating?.count ?? 0,
      }
    })
  }

  async findAll() {
    const recipes = await this.recipeModel.find({ hidden: { $ne: true } }).exec()
    const plain = recipes.map(r => r.toObject())
    const ratings = await this.ratingsBySlug(plain.map(r => r.slug))
    return this.attachRatings(plain, ratings)
  }

  async findBySlug(slug: string) {
    const recipe = await this.recipeModel.findOne({ slug, hidden: { $ne: true } }).exec()
    if (!recipe) return null
    const ratings = await this.ratingsBySlug([slug])
    return this.attachRatings([recipe.toObject()], ratings)[0]
  }
}
```

Note: this changes the return type from `RecipeDocument`/`RecipeDocument[]` to plain objects with the two extra fields. `RecipesController` doesn't need changes — it just returns whatever the service gives it.

- [ ] **Step 14: Run test to verify it passes**

Run: `cd api && npm test -- recipes.service.spec.ts`
Expected: PASS (existing 2 cases + new case)

- [ ] **Step 15: Update `api/src/recipes/recipes.module.ts`** to also register the `Rating` model

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Recipe, RecipeSchema } from './schemas/recipe.schema'
import { Rating, RatingSchema } from '../ratings/schemas/rating.schema'
import { RecipesService } from './recipes.service'
import { RecipesController } from './recipes.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: Rating.name, schema: RatingSchema },
    ]),
    ActivityLogModule,
  ],
  providers: [RecipesService],
  controllers: [RecipesController],
  exports: [RecipesService],
})
export class RecipesModule {}
```

- [ ] **Step 16: Run full suite, build, e2e**

Run: `cd api && npm test && npm run build && npm run test:e2e`
Expected: all green (the e2e test's recipe fixture will now also carry `averageRating: null, ratingCount: 0` — no assertion changes needed since the e2e test doesn't check those fields specifically, only `slug`/`title` presence via status codes).

- [ ] **Step 17: Commit**

```bash
git add api/src/ratings api/src/recipes api/src/main.ts api/package.json api/package-lock.json
git commit -m "feat(api): add ratings controller and average-rating aggregation on recipes"
```

---

### Task 3: Frontend — favorites, ratings, sharing

**Files:**
- Create: `src/hooks/useFavorites.ts`
- Modify: `src/types.ts` (add `averageRating`, `ratingCount` to `Recipe`)
- Modify: `src/hooks/useRecipes.ts` (pass through the two new fields, no shape change needed beyond the type)
- Modify: `src/components/RecipeCard.tsx` (favorite star, average rating display)
- Modify: `src/components/RecipeDetail.tsx` (favorite button, share button, 5-star rating input)
- Modify: `src/components/Home.tsx` (favorites filter chip)
- Modify: `src/components/Nav.tsx` (Clerk `<UserButton>`)

**Interfaces:**
- Consumes: `GET/POST/DELETE /favorites`, `PUT /ratings/:slug` from Tasks 1-2.
- Produces: `useFavorites()` → `{ favoriteSlugs: Set<string>, toggle: (slug: string) => void, loading: boolean }`.

- [ ] **Step 1: Add rating fields to `src/types.ts`**

In the `Recipe` interface, add after `tipsEn?: string[]`:

```ts
  averageRating?: number | null
  ratingCount?: number
```

- [ ] **Step 2: Create `src/hooks/useFavorites.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export function useFavorites() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false

    apiFetch<string[]>('/favorites', getToken)
      .then(slugs => {
        if (!cancelled) setFavoriteSlugs(new Set(slugs))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

  const toggle = useCallback(async (slug: string) => {
    const isFavorited = favoriteSlugs.has(slug)
    const method = isFavorited ? 'DELETE' : 'POST'

    setFavoriteSlugs(prev => {
      const next = new Set(prev)
      isFavorited ? next.delete(slug) : next.add(slug)
      return next
    })

    const token = await getToken()
    const res = await fetch(`/api/favorites/${slug}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

    if (!res.ok) {
      setFavoriteSlugs(prev => {
        const next = new Set(prev)
        isFavorited ? next.add(slug) : next.delete(slug)
        return next
      })
    }
  }, [favoriteSlugs, getToken])

  return { favoriteSlugs, toggle, loading }
}
```

- [ ] **Step 3: Add a favorite star + rating display to `src/components/RecipeCard.tsx`**

Add a new prop to `RecipeCardProps`:

```ts
interface RecipeCardProps {
  recipe: Recipe
  index: number
  searchQuery: string
  isFavorite: boolean
  onToggleFavorite: (slug: string) => void
}
```

Update the function signature: `export default function RecipeCard({ recipe, index, searchQuery, isFavorite, onToggleFavorite }: RecipeCardProps) {`

Inside the `{recipe.featured && (...)}` block's sibling position (top-right of the image), add a favorite button. Replace this existing block:

```tsx
            {recipe.featured && (
              <div className="absolute top-3 right-3">
                <span className="tag-terra text-[10px] font-semibold px-2 py-0.5">{tx.featured}</span>
              </div>
            )}
```

with:

```tsx
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {recipe.featured && (
                <span className="tag-terra text-[10px] font-semibold px-2 py-0.5">{tx.featured}</span>
              )}
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(recipe.id) }}
                className={`h-7 w-7 flex items-center justify-center rounded-full backdrop-blur-sm border transition-colors ${
                  isFavorite
                    ? 'bg-amber/90 border-amber text-bg'
                    : 'bg-black/30 border-white/20 text-white/80 hover:text-white'
                }`}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg className="w-3.5 h-3.5" fill={isFavorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                </svg>
              </button>
            </div>
```

In the meta row, after the `difficulty` span, add average rating display. Replace:

```tsx
              <span className={`font-medium ${difficultyColor[recipe.difficulty]}`}>
                {tx.difficulty[recipe.difficulty]}
              </span>
              {recipe.cuisine && (
```

with:

```tsx
              <span className={`font-medium ${difficultyColor[recipe.difficulty]}`}>
                {tx.difficulty[recipe.difficulty]}
              </span>
              {!!recipe.averageRating && (
                <span className="flex items-center gap-1 text-amber">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.175 0l-3.367 2.446c-.784.57-1.838-.196-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.813 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z" />
                  </svg>
                  {recipe.averageRating}
                </span>
              )}
              {recipe.cuisine && (
```

- [ ] **Step 4: Wire `RecipeCard`'s new props from `src/components/Home.tsx`**

Add the import and hook call:

```ts
import { useFavorites } from '../hooks/useFavorites'
```

Inside `Home()`, after `const { recipes, loading, error } = useRecipes()`, add:

```ts
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
```

Update the `filtered` `useMemo` to also filter by favorites — change the dependency array and add a filter line. Replace:

```ts
  const filtered = useMemo(() => {
    let list = recipes.filter(r => !r.hidden)
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
```

with:

```ts
  const filtered = useMemo(() => {
    let list = recipes.filter(r => !r.hidden)
    if (showFavoritesOnly) list = list.filter(r => favoriteSlugs.has(r.id))
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
```

and update the dependency array:

```ts
  }, [search, activeCategory, lang, recipes, showFavoritesOnly, favoriteSlugs])
```

Add a "Favorites" filter chip right after the "All" category chip (inside the category filter's flex container, before the `{categories.map(...)}` line):

```tsx
          <button
            onClick={() => setShowFavoritesOnly(v => !v)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
              showFavoritesOnly
                ? 'text-amber bg-amber/10 border border-amber/20'
                : 'text-cream/40 hover:text-cream/70 border border-transparent'
            }`}
          >
            <span>♥</span>
            <span>{lang === 'he' ? 'מועדפים' : 'Favorites'}</span>
          </button>
```

Update the `RecipeCard` usage to pass the new props. Replace:

```tsx
              <RecipeCard key={r.id} recipe={r} index={i} searchQuery={search} />
```

with:

```tsx
              <RecipeCard
                key={r.id}
                recipe={r}
                index={i}
                searchQuery={search}
                isFavorite={favoriteSlugs.has(r.id)}
                onToggleFavorite={toggleFavorite}
              />
```

- [ ] **Step 5: Add favorite button, share button, and rating input to `src/components/RecipeDetail.tsx`**

Add imports at the top:

```ts
import { useFavorites } from '../hooks/useFavorites'
import { useAuth } from '@clerk/react'
```

Inside `RecipeDetail()`, after the `const { recipe } = useRecipe(id)` line, add:

```ts
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { getToken } = useAuth()
  const [userRating, setUserRating] = useState<number | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')

  async function rate(score: number) {
    setUserRating(score)
    const token = await getToken()
    await fetch(`/api/ratings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ score }),
    })
  }

  async function share() {
    const shareData = { title: recipe?.title, url: window.location.href }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch { /* user cancelled */ }
      return
    }
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    } catch { /* clipboard unavailable */ }
  }
```

In the header card, after the meta grid (`</div>` that closes the `grid grid-cols-2 sm:grid-cols-4 gap-3` block, right before the closing `</div>` of the header card itself), add a favorites/rating/share row:

```tsx
          <div className="flex items-center gap-4 mt-5 pt-5 border-t border-tint/[0.06]">
            <button
              onClick={() => toggleFavorite(recipe.id)}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                favoriteSlugs.has(recipe.id) ? 'text-amber' : 'text-cream/40 hover:text-cream/70'
              }`}
            >
              <svg className="w-4 h-4" fill={favoriteSlugs.has(recipe.id) ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
              </svg>
              {lang === 'he' ? 'מועדף' : 'Favorite'}
            </button>

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => rate(n)} className="text-lg leading-none">
                  <span className={n <= (userRating ?? 0) ? 'text-amber' : 'text-cream/20'}>★</span>
                </button>
              ))}
              {!!recipe.averageRating && (
                <span className="text-cream/40 text-xs ms-1">
                  {recipe.averageRating} ({recipe.ratingCount})
                </span>
              )}
            </div>

            <button
              onClick={share}
              className="ms-auto flex items-center gap-1.5 text-sm font-medium text-cream/40 hover:text-cream/70 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684l-6.44 3.22a3 3 0 100 2.684l6.44-3.22zM8.684 13.342l6.632 3.316m0-11.317l-6.632 3.316" />
              </svg>
              {shareState === 'copied' ? (lang === 'he' ? 'הועתק!' : 'Copied!') : (lang === 'he' ? 'שתף' : 'Share')}
            </button>
          </div>
```

- [ ] **Step 6: Add Clerk `<UserButton>` to `src/components/Nav.tsx`**

Add the import:

```ts
import { UserButton } from '@clerk/react'
```

Add `<UserButton afterSignOutUrl="/" />` as the last child inside the `<div className="flex items-center gap-2">` block (after the language toggle button).

- [ ] **Step 7: Type-check, lint, build**

Run: `npx tsc -b && npx eslint src/hooks/useFavorites.ts src/components/RecipeCard.tsx src/components/RecipeDetail.tsx src/components/Home.tsx src/components/Nav.tsx src/types.ts && npm run build`
Expected: no new TypeScript errors, no new lint errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useFavorites.ts src/types.ts src/components/RecipeCard.tsx src/components/RecipeDetail.tsx src/components/Home.tsx src/components/Nav.tsx
git commit -m "feat: add favorites, ratings, and sharing to the frontend"
```

---

### Task 4: Visual pass (editorial cookbook direction)

**Files:**
- Modify: `src/index.css` (typography/spacing tokens only — color tokens unchanged)
- Modify: `src/components/RecipeCard.tsx` (image aspect ratio, title scale)
- Modify: `src/components/Home.tsx` (hero spacing)

This task is a design/polish pass rather than a mechanical diff — implement it directly against the running app (`npm run dev`), iterating on spacing/scale/imagery visually rather than from a pre-written diff, since the "no placeholders" rule for code steps doesn't fit exploratory CSS work well. Acceptance criteria:

- [ ] Recipe card images are larger (increase `h-44 sm:h-48` toward `h-52 sm:h-60` in `RecipeCard.tsx`) and card titles read at a more magazine-like scale (`text-base` → `text-lg` for the serif title).
- [ ] Home's search/filter block gets more vertical breathing room (increase `pt-6 pb-4` toward `pt-10 pb-6` in the search+categories wrapper).
- [ ] Run `npm run build` after any change and visually confirm via `npm run dev` before committing.
- [ ] Commit as `style: push card imagery and spacing toward the editorial cookbook direction`.
