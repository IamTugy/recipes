# Cook Mode Redesign — Phase G: Post-Cook Review Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prompt a user to write a review right after finishing a guided cook, and remind them once more (in-app, next visit) if 24 hours pass without one.

**Architecture:** One new read-only backend endpoint (`GET /cook-sessions/reminders`) queries the existing `CookSession`/`Rating`/`Recipe` collections for finished-but-unreviewed cooks older than 24h. On the frontend, a new `PostCookReviewModal` component (condensed review form, reusing `RecipeDetail.tsx`'s existing review state/handlers) opens the moment a cook finishes if unreviewed; a new globally-mounted `CookReminderBanner` component (same mount pattern as the existing `JobsWatcher`) checks the new endpoint once per app load and shows a one-time dismissible toast.

**Tech Stack:** NestJS, Mongoose, React/Vite, base-ui `Toast`. No new dependencies.

## Global Constraints

- "Reviewed" is defined exactly as `hasPostedReview` already defines it elsewhere in this codebase: a `Rating` document for `(userId, recipeId)` with a non-empty `comment` — a star-only rating with no comment does NOT count as reviewed.
- `GET /cook-sessions/reminders` is scoped to the caller (`req.userId`), returns `{ recipeId: string; recipeTitle: string; finishedAt: string }[]` for finished `CookSession`s at least 24 hours old with no matching reviewed `Rating`. Does not paginate or generalize into a history endpoint — narrow and purpose-built, per spec.
- The post-finish modal only opens when `!hasPostedReview` for the recipe just finished — if the user already reviewed a prior cook of the same recipe, no modal.
- The modal reuses `RecipeDetail.tsx`'s existing review state (`userRating`, `hoverRating`, `reviewComment`, `reviewPhotoUrl`, `reviewPhotoUploading`) and handlers (`rate`, `handlePhotoSelect`, `postReview`) — no new state duplicating what already exists, only a new presentational component receiving them as props.
- The reminder banner checks once per app load (not a recurring poll) and is shown at most once per recipe — marking a recipe's reminder as shown (via `localStorage`) happens the moment its toast is added, not on explicit dismissal, so a page reload doesn't re-surface a reminder the user has already seen once. This is a deliberate one-time-nudge design, not a recurring nag.
- No new npm dependencies.

---

## Task 1: Backend — `GET /cook-sessions/reminders`

**Files:**
- Modify: `api/src/cook-sessions/cook-sessions.service.ts`
- Modify: `api/src/cook-sessions/cook-sessions.service.spec.ts`
- Modify: `api/src/cook-sessions/cook-sessions.controller.ts`
- Modify: `api/src/cook-sessions/cook-sessions.controller.spec.ts`
- Modify: `api/src/cook-sessions/cook-sessions.module.ts`

**Interfaces:**
- Produces: `CookSessionsService.getReminders(userId: string): Promise<CookReminderView[]>` where `CookReminderView = { recipeId: string; recipeTitle: string; finishedAt: string }`.
- Produces (HTTP, consumed by Task 2): `GET /cook-sessions/reminders` → `CookReminderView[]`.
- Consumes: `Rating`/`RatingDocument` (new — `CookSessionsModule` gains a `Rating` model dependency; `Recipe` is already injected from an earlier phase).

- [ ] **Step 1: Write the failing tests**

Add to `api/src/cook-sessions/cook-sessions.service.spec.ts`. First, add the `Rating` model mock alongside the existing `recipeModel` mock declaration. Find:

```ts
  const recipeFindOne = jest.fn()
  const recipeModel = { findOne: recipeFindOne }
```

Add right after it:

```ts
  const cookSessionFind = jest.fn()
  const ratingFind = jest.fn()
  const ratingModel = { find: ratingFind }
```

Find the `makeService()` helper's `providers` array and add the new provider, and also confirm the existing `CookSession` model mock (`model` variable, already used for `.create` calls) also supports `.find` — check whether the existing `model` mock object already has a `find` method; if not, add one. Find:

```ts
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
```

Add right after it:

```ts
        { provide: getModelToken(Recipe.name), useValue: recipeModel },
        { provide: getModelToken(Rating.name), useValue: ratingModel },
```

Add the import for `Rating` near the top of the file:

```ts
import { Recipe } from '../recipes/schemas/recipe.schema'
```

becomes:

```ts
import { Recipe } from '../recipes/schemas/recipe.schema'
import { Rating } from '../ratings/schemas/rating.schema'
```

Then extend the existing `model` object (the `CookSession` mock, likely named `model` with a `create` property already in it) to also support chained `.find().sort().exec()`-style calls needed for `getReminders`. Find the `CookSession` model mock declaration (search for `const model = { create }` or similar) and add a `find` mock:

```ts
  const model = { create }
```

becomes:

```ts
  const cookSessionFind = jest.fn()
  const model = { create, find: cookSessionFind }
```

(If `cookSessionFind` was already declared above per the earlier instruction, remove the duplicate declaration here and just reuse it in the `model` object.)

Then add these new test cases (append to the file, inside the existing `describe('CookSessionsService', ...)` block):

```ts
  it('getReminders returns a finished, unreviewed, >24h-old session', async () => {
    const oldEnough = new Date(Date.now() - 25 * 60 * 60 * 1000)
    cookSessionFind.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        { userId: 'user_1', recipeId: 'recipe_a', finishedAt: oldEnough },
      ]),
    })
    ratingFind.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ title: 'Chicken Soup' }) })
    const service = await makeService()
    const result = await service.getReminders('user_1')
    expect(result).toEqual([
      { recipeId: 'recipe_a', recipeTitle: 'Chicken Soup', finishedAt: oldEnough.toISOString() },
    ])
  })

  it('getReminders excludes a session finished less than 24 hours ago', async () => {
    const tooRecent = new Date(Date.now() - 2 * 60 * 60 * 1000)
    cookSessionFind.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        { userId: 'user_1', recipeId: 'recipe_a', finishedAt: tooRecent },
      ]),
    })
    ratingFind.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService()
    const result = await service.getReminders('user_1')
    expect(result).toEqual([])
  })

  it('getReminders excludes a session for a recipe that already has a reviewed rating (non-empty comment)', async () => {
    const oldEnough = new Date(Date.now() - 25 * 60 * 60 * 1000)
    cookSessionFind.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        { userId: 'user_1', recipeId: 'recipe_a', finishedAt: oldEnough },
      ]),
    })
    ratingFind.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ userId: 'user_1', recipeId: 'recipe_a', comment: 'Great recipe!' }]),
    })
    const service = await makeService()
    const result = await service.getReminders('user_1')
    expect(result).toEqual([])
  })

  it('getReminders includes a session for a recipe with only a star rating and no comment', async () => {
    const oldEnough = new Date(Date.now() - 25 * 60 * 60 * 1000)
    cookSessionFind.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        { userId: 'user_1', recipeId: 'recipe_a', finishedAt: oldEnough },
      ]),
    })
    ratingFind.mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ userId: 'user_1', recipeId: 'recipe_a', comment: '' }]),
    })
    recipeFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ title: 'Chicken Soup' }) })
    const service = await makeService()
    const result = await service.getReminders('user_1')
    expect(result).toEqual([
      { recipeId: 'recipe_a', recipeTitle: 'Chicken Soup', finishedAt: oldEnough.toISOString() },
    ])
  })

  it('getReminders scopes the CookSession query to the given userId', async () => {
    cookSessionFind.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService()
    await service.getReminders('user_1')
    expect(cookSessionFind).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: FAIL — `getReminders` not defined

- [ ] **Step 3: Implement `getReminders`**

In `api/src/cook-sessions/cook-sessions.service.ts`, add the import:

```ts
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
```

becomes:

```ts
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema'
import { Rating, RatingDocument } from '../ratings/schemas/rating.schema'
```

Add the new exported interface near `CurrentCookSessionView`:

```ts
export interface CurrentCookSessionView {
  sessionId: string
  recipeId: string
  recipeTitle: string
}
```

becomes:

```ts
export interface CurrentCookSessionView {
  sessionId: string
  recipeId: string
  recipeTitle: string
}

export interface CookReminderView {
  recipeId: string
  recipeTitle: string
  finishedAt: string
}
```

Add the `Rating` model to the constructor:

```ts
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    private readonly redis: RedisService,
    private readonly cookLogService: CookLogService,
  ) {}
```

Replace with:

```ts
  constructor(
    @InjectModel(CookSession.name) private readonly cookSessionModel: Model<CookSessionDocument>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
    private readonly redis: RedisService,
    private readonly cookLogService: CookLogService,
  ) {}
```

Add the new method at the end of the class, right before the closing brace:

```ts
  // "Reviewed" here matches the exact definition already used across the
  // frontend for hasPostedReview: a Rating with a non-empty comment - a
  // star-only rating doesn't count, since it doesn't represent the
  // written review this nudge is trying to collect.
  async getReminders(userId: string): Promise<CookReminderView[]> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const finishedSessions = await this.cookSessionModel
      .find({ userId, finishedAt: { $lte: cutoff } })
      .exec()
    if (finishedSessions.length === 0) return []

    const recipeIds = [...new Set(finishedSessions.map(s => s.recipeId))]
    const reviewedRatings = await this.ratingModel
      .find({ userId, recipeId: { $in: recipeIds } })
      .exec()
    const reviewedRecipeIds = new Set(
      reviewedRatings.filter(r => !!r.comment?.trim()).map(r => r.recipeId)
    )

    const unreviewedRecipeIds = recipeIds.filter(id => !reviewedRecipeIds.has(id))
    if (unreviewedRecipeIds.length === 0) return []

    const reminders: CookReminderView[] = []
    for (const recipeId of unreviewedRecipeIds) {
      const session = finishedSessions.find(s => s.recipeId === recipeId)
      if (!session) continue
      const recipe = await this.recipeModel.findOne({ _id: recipeId }).exec()
      reminders.push({
        recipeId,
        recipeTitle: recipe?.title ?? '',
        finishedAt: session.finishedAt.toISOString(),
      })
    }
    return reminders
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx jest cook-sessions/cook-sessions.service.spec.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 5: Write the failing controller test**

Add to `api/src/cook-sessions/cook-sessions.controller.spec.ts`, add `getReminders: jest.fn()` to the shared `cookSessionsService` mock object at the top of the file, then append:

```ts
  it('GET /cook-sessions/reminders returns the reminders list for the authenticated user', async () => {
    const reminders = [{ recipeId: 'recipe_a', recipeTitle: 'Chicken Soup', finishedAt: '2026-08-14T10:00:00.000Z' }]
    cookSessionsService.getReminders.mockResolvedValue(reminders)
    const controller = new CookSessionsController(cookSessionsService as any)
    const result = await controller.getReminders({ userId: 'user_1' } as any)
    expect(cookSessionsService.getReminders).toHaveBeenCalledWith('user_1')
    expect(result).toEqual(reminders)
  })
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd api && npx jest cook-sessions/cook-sessions.controller.spec.ts`
Expected: FAIL — `controller.getReminders` is not a function

- [ ] **Step 7: Add the controller endpoint**

Find in `api/src/cook-sessions/cook-sessions.controller.ts`:

```ts
  @Get('current')
  async getCurrent(@Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getCurrentSession(req.userId)
  }
```

Add right after it:

```ts
  @Get('current')
  async getCurrent(@Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getCurrentSession(req.userId)
  }

  @Get('reminders')
  async getReminders(@Req() req: Request & { userId: string }) {
    return this.cookSessionsService.getReminders(req.userId)
  }
```

- [ ] **Step 8: Run the controller test to verify it passes**

Run: `cd api && npx jest cook-sessions/cook-sessions.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Wire the `Rating` model into `CookSessionsModule`**

Find `api/src/cook-sessions/cook-sessions.module.ts`:

```ts
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
```

becomes:

```ts
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { Rating, RatingSchema } from '../ratings/schemas/rating.schema'
```

Find:

```ts
    MongooseModule.forFeature([
      { name: CookSession.name, schema: CookSessionSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
```

Replace with:

```ts
    MongooseModule.forFeature([
      { name: CookSession.name, schema: CookSessionSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: Rating.name, schema: RatingSchema },
    ]),
```

- [ ] **Step 10: Run the full API test suite**

Run: `cd api && npm test`
Expected: PASS, no regressions

- [ ] **Step 11: Commit**

```bash
git add api/src/cook-sessions
git commit -m "$(cat <<'EOF'
feat: add GET /cook-sessions/reminders for post-cook review nudge

Phase G of the cook-mode redesign - a new read-only endpoint that
finds the signed-in user's finished-but-unreviewed cook sessions
(CookSession, Phase C) at least 24 hours old, excluding any recipe
that already has a Rating with a non-empty comment (the same
"reviewed" definition already used by the frontend's
hasPostedReview). Purpose-built and narrow, not a general history
endpoint - that's Phase H's job.

docs/superpowers/specs/2026-08-15-post-cook-review-nudge-design.md
EOF
)"
```

---

## Task 2: Frontend — post-finish modal + reminder banner

**Files:**
- Modify: `src/lib/cookSessions.ts`
- Create: `src/components/PostCookReviewModal.tsx`
- Create: `src/components/CookReminderBanner.tsx`
- Modify: `src/i18n.ts`
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes (from Task 1, via HTTP): `GET /cook-sessions/reminders` → `{ recipeId: string; recipeTitle: string; finishedAt: string }[]`.
- Produces: `src/lib/cookSessions.ts` gains `getCookReminders(getToken: () => Promise<string | null>): Promise<CookReminder[]>` where `CookReminder = { recipeId: string; recipeTitle: string; finishedAt: string }`. `PostCookReviewModal` is a new presentational component. `CookReminderBanner` is a new globally-mounted component with no props.

- [ ] **Step 1: Add the frontend API wrapper**

Append to `src/lib/cookSessions.ts` (after the existing `getCurrentCookSession` function):

```ts

export interface CookReminder {
  recipeId: string
  recipeTitle: string
  finishedAt: string
}

export async function getCookReminders(
  getToken: () => Promise<string | null>
): Promise<CookReminder[]> {
  try {
    const token = await getToken()
    const res = await fetch('/api/cook-sessions/reminders', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return []
    return (await res.json()) as CookReminder[]
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Add new i18n keys**

In `src/i18n.ts`, find the `he` block's `startCooking` entry (already followed by `cooking`/`alreadyCookingElsewhere`/`cookingElsewhereWarning`/`startNewCook` from an earlier phase - add these new keys right after `startNewCook`):

```ts
      startNewCook: "התחל בישול חדש",
```

Add right after it:

```ts
      startNewCook: "התחל בישול חדש",
      howWasIt: "איך היה?",
      tellUsAboutYourCook: "ספרו לנו איך היה הבישול הזה",
      maybeLater: "אולי אחר כך",
      reminderToReview: (recipeTitle: string) => `איך היה "${recipeTitle}"? נשמח לחוות דעתכם`,
```

Find the `en` block's equivalent (`startNewCook: "Start new cook",`):

```ts
      startNewCook: "Start new cook",
```

Add right after it:

```ts
      startNewCook: "Start new cook",
      howWasIt: "How was it?",
      tellUsAboutYourCook: "Tell us how this cook went",
      maybeLater: "Maybe later",
      reminderToReview: (recipeTitle: string) => `How was "${recipeTitle}"? We'd love your review`,
```

- [ ] **Step 3: Create `src/components/PostCookReviewModal.tsx`**

```tsx
import Modal from './Modal'
import { Dialog } from '@base-ui/react/dialog'
import { t } from '../i18n'

interface PostCookReviewModalProps {
  open: boolean
  lang: 'he' | 'en'
  userRating: number | null
  hoverRating: number | null
  onHoverRating: (n: number | null) => void
  onRate: (n: number) => void
  reviewComment: string
  onCommentChange: (value: string) => void
  reviewPhotoUrl: string | null
  reviewPhotoUploading: boolean
  onPhotoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemovePhoto: () => void
  onSubmit: () => void
  onDismiss: () => void
}

export default function PostCookReviewModal({
  open, lang, userRating, hoverRating, onHoverRating, onRate,
  reviewComment, onCommentChange, reviewPhotoUrl, reviewPhotoUploading,
  onPhotoSelect, onRemovePhoto, onSubmit, onDismiss,
}: PostCookReviewModalProps) {
  const tx = t[lang]
  return (
    <Modal open={open} onOpenChange={next => { if (!next) onDismiss() }} zIndexClassName="z-[80]" panelClassName="max-w-sm p-6 space-y-4">
      <Dialog.Title className="font-serif text-lg font-bold text-cream">{tx.howWasIt}</Dialog.Title>
      <p className="text-sm text-cream/60">{tx.tellUsAboutYourCook}</p>
      <div className="flex items-center gap-1.5" onMouseLeave={() => onHoverRating(null)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            type="button"
            key={n}
            onClick={() => onRate(n)}
            onMouseEnter={() => onHoverRating(n)}
            aria-label={`${n} ★`}
            className="text-2xl leading-none p-1"
          >
            <span className={n <= (hoverRating ?? userRating ?? 0) ? 'text-amber' : 'text-cream/20'}>★</span>
          </button>
        ))}
      </div>
      <textarea
        value={reviewComment}
        onChange={e => onCommentChange(e.target.value)}
        placeholder={userRating ? undefined : ' '}
        rows={2}
        maxLength={500}
        disabled={!userRating}
        className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-3 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none disabled:opacity-50"
        dir={lang === 'he' ? 'rtl' : 'ltr'}
      />
      {reviewPhotoUrl && (
        <div className="relative w-24 h-24">
          <img src={reviewPhotoUrl} alt="" className="w-full h-full object-cover rounded-lg" />
          <button type="button"
            onClick={onRemovePhoto}
            aria-label="✕"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white text-[10px] hover:bg-black/80"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-tint/10 transition-colors ${
          userRating ? 'text-cream/40 hover:text-cream/70 cursor-pointer' : 'text-cream/20 cursor-not-allowed'
        }`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {reviewPhotoUploading ? '...' : reviewPhotoUrl ? '↻' : '+'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPhotoSelect}
            disabled={!userRating || reviewPhotoUploading}
            className="hidden"
          />
        </label>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDismiss} className="btn-ghost">
          {tx.maybeLater}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!userRating || !reviewComment.trim() || reviewPhotoUploading}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {tx.postReview}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Wire the modal into `RecipeDetail.tsx`**

Add the import near the other component imports:

```tsx
import ConfirmDialog from './ConfirmDialog'
```

becomes:

```tsx
import ConfirmDialog from './ConfirmDialog'
import PostCookReviewModal from './PostCookReviewModal'
```

Add new state near the other `cookSession*`/review state declarations (find `const [hasPostedReview, setHasPostedReview] = useState(false)`):

```tsx
  const [hasPostedReview, setHasPostedReview] = useState(false)
```

becomes:

```tsx
  const [hasPostedReview, setHasPostedReview] = useState(false)
  const [showPostCookReviewModal, setShowPostCookReviewModal] = useState(false)
```

Find `advanceWizardOrFinish()`:

```tsx
  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      if (cookSessionId) {
        finishCookSession(cookSessionId, getToken)
        setCookSessionId(null)
      }
      setCookSessionActive(false)
    } else {
      setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
    }
  }
```

Replace with:

```tsx
  function advanceWizardOrFinish() {
    if (wizardIndex === flatSteps.length - 1) {
      if (cookSessionId) {
        finishCookSession(cookSessionId, getToken)
        setCookSessionId(null)
      }
      setCookSessionActive(false)
      if (!hasPostedReview) setShowPostCookReviewModal(true)
    } else {
      setWizardIndex(i => Math.min(i + 1, flatSteps.length - 1))
    }
  }
```

Find `postReview()`:

```tsx
  function postReview() {
    if (!userRating) return
    submitRating(userRating, reviewComment.trim(), reviewPhotoUrl ?? undefined)
    const wasAlreadyPosted = hasPostedReview
    setHasPostedReview(true)
    setIsEditingReview(false)
    showToast(
      wasAlreadyPosted
        ? (tx.reviewUpdated)
        : (tx.reviewPosted)
    )
  }
```

Replace with:

```tsx
  function postReview() {
    if (!userRating) return
    submitRating(userRating, reviewComment.trim(), reviewPhotoUrl ?? undefined)
    const wasAlreadyPosted = hasPostedReview
    setHasPostedReview(true)
    setIsEditingReview(false)
    setShowPostCookReviewModal(false)
    showToast(
      wasAlreadyPosted
        ? (tx.reviewUpdated)
        : (tx.reviewPosted)
    )
  }
```

Find the `<ConfirmDialog .../>` for the cook-conflict warning added in an earlier phase (search for `open={!!cookConflict}`) and add the new modal right after that dialog's closing tag, before the component's final closing `</div>`/`)`/`}`:

```tsx
      <ConfirmDialog
        open={!!cookConflict}
        title={tx.alreadyCookingElsewhere}
        message={cookConflict ? tx.cookingElsewhereWarning(cookConflict.recipeTitle) : ''}
        confirmLabel={tx.startNewCook}
        cancelLabel={tx.cancel}
        busy={resolvingCookConflict}
        onConfirm={confirmStartNewCook}
        onCancel={() => setCookConflict(null)}
      />
    </div>
  )
}
```

Replace with:

```tsx
      <ConfirmDialog
        open={!!cookConflict}
        title={tx.alreadyCookingElsewhere}
        message={cookConflict ? tx.cookingElsewhereWarning(cookConflict.recipeTitle) : ''}
        confirmLabel={tx.startNewCook}
        cancelLabel={tx.cancel}
        busy={resolvingCookConflict}
        onConfirm={confirmStartNewCook}
        onCancel={() => setCookConflict(null)}
      />

      <PostCookReviewModal
        open={showPostCookReviewModal}
        lang={lang}
        userRating={userRating}
        hoverRating={hoverRating}
        onHoverRating={setHoverRating}
        onRate={rate}
        reviewComment={reviewComment}
        onCommentChange={setReviewComment}
        reviewPhotoUrl={reviewPhotoUrl}
        reviewPhotoUploading={reviewPhotoUploading}
        onPhotoSelect={handlePhotoSelect}
        onRemovePhoto={() => setReviewPhotoUrl(null)}
        onSubmit={postReview}
        onDismiss={() => setShowPostCookReviewModal(false)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Create `src/components/CookReminderBanner.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { getCookReminders } from '../lib/cookSessions'
import { toastManager } from '../context/toastContextObject'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'

const DISMISSED_KEY_PREFIX = 'cook-reminder-shown-'

function wasAlreadyShown(recipeId: string): boolean {
  try {
    return localStorage.getItem(`${DISMISSED_KEY_PREFIX}${recipeId}`) === '1'
  } catch {
    return false
  }
}

function markShown(recipeId: string): void {
  try {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}${recipeId}`, '1')
  } catch {
    // localStorage unavailable - the reminder just shows again next load, harmless
  }
}

// Global, mounted once outside the page-routed tree (see main.tsx), same
// pattern as JobsWatcher - checks once per app load (not a recurring poll)
// whether the user has any finished-but-unreviewed cook older than 24h,
// and surfaces a one-time dismissible toast for the first one found. Local
// per-recipe dismissal (not synced across devices) since the underlying
// condition - an actual posted review - is what permanently clears it
// either way.
export default function CookReminderBanner() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { lang } = useLanguage()
  const tx = t[lang]
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || checkedRef.current) return
    checkedRef.current = true

    getCookReminders(getToken).then(reminders => {
      const unshown = reminders.find(r => !wasAlreadyShown(r.recipeId))
      if (!unshown) return
      markShown(unshown.recipeId)
      toastManager.add({
        description: tx.reminderToReview(unshown.recipeTitle),
        type: 'info',
        timeout: 0,
        data: { href: `/recipes/${unshown.recipeId}` },
      })
    })
  }, [isLoaded, isSignedIn, getToken, tx])

  return null
}
```

- [ ] **Step 6: Mount `CookReminderBanner` in `main.tsx`**

Find the `JobsWatcher` import and mount point:

```tsx
import JobsWatcher from './components/JobsWatcher'
```

becomes:

```tsx
import JobsWatcher from './components/JobsWatcher'
import CookReminderBanner from './components/CookReminderBanner'
```

Find:

```tsx
              <JobsWatcher />
```

Add right after it:

```tsx
              <JobsWatcher />
              <CookReminderBanner />
```

- [ ] **Step 7: Build and lint**

```bash
npm run build
```

Expected: passes with no TypeScript errors.

```bash
npx eslint src/lib/cookSessions.ts src/i18n.ts src/components/PostCookReviewModal.tsx src/components/CookReminderBanner.tsx src/components/RecipeDetail.tsx src/main.tsx
```

Expected: no errors, no unexpected warnings.

- [ ] **Step 8: Manual verification**

With the backend running and a signed-in user: finish a guided cook on a recipe never reviewed before - confirm the review modal opens immediately with a star rating, comment box, and optional photo upload; submitting posts the review exactly as the existing inline form does (same toast, same `hasPostedReview` state), and "Maybe later" dismisses without posting. Finish a cook on a recipe already reviewed - confirm no modal opens. For the banner: this requires either backdating a `CookSession.finishedAt` in Mongo by more than 24h, or waiting - confirm that on the next app load, a dismissible toast appears naming the recipe and links to it on click, and that reloading again doesn't re-show the same toast (local dismissal). This step can't be fully run by an agentic implementer without live infra and time-travel on a database record - note in the report if it wasn't possible, that's expected; Step 7's build/lint checks are the verifiable bar.

- [ ] **Step 9: Commit**

```bash
git add src/lib/cookSessions.ts src/i18n.ts src/components/PostCookReviewModal.tsx src/components/CookReminderBanner.tsx src/components/RecipeDetail.tsx src/main.tsx
git commit -m "$(cat <<'EOF'
feat: prompt for a review right after finishing a cook, remind once later

Phase G frontend half: finishing a guided cook session now opens a
condensed review modal (star rating, comment, optional photo) if
the recipe hasn't been reviewed yet - reuses RecipeDetail.tsx's
existing review state/handlers rather than duplicating them, "Maybe
later" dismisses without posting. A new globally-mounted
CookReminderBanner (same pattern as JobsWatcher) checks once per
app load for any finished-but-unreviewed cook at least 24h old and
shows a one-time dismissible toast linking to that recipe.

docs/superpowers/specs/2026-08-15-post-cook-review-nudge-design.md
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** "Reviewed" = non-empty `Rating.comment`, matching `hasPostedReview` exactly ✓ Task 1 Step 3 (filter on `r.comment?.trim()`). Endpoint scoped to caller, 24h cutoff, narrow shape ✓ Task 1 Step 3. Modal only opens when unreviewed ✓ Task 2 Step 4 (`if (!hasPostedReview) setShowPostCookReviewModal(true)`). Modal reuses existing state/handlers, not duplicated ✓ Task 2 Steps 3-4 (all props passed through from `RecipeDetail.tsx`'s existing variables). Banner checks once per app load, one-time-per-recipe dismissal via `localStorage` marked at show-time ✓ Task 2 Step 5. No new dependencies ✓ confirmed throughout (reuses `Modal`, `toastManager`, `useAuth`, `useLanguage`, all pre-existing).
- **Placeholder scan:** No TBD/TODO; every code block is complete, including the full new component files and test additions.
- **Type consistency:** `CookReminderView` (backend, Task 1) and `CookReminder` (frontend, Task 2 Step 1) have identical field names/types (`recipeId: string`, `recipeTitle: string`, `finishedAt: string`). `getReminders`'s signature matches exactly between the service, its tests, and the controller. `PostCookReviewModalProps` field names match exactly what `RecipeDetail.tsx` passes in Step 4 (`userRating`, `hoverRating`, `reviewComment`, `reviewPhotoUrl`, `reviewPhotoUploading` are all pre-existing state variables in that file, referenced by their existing names).
