# Async Recipe Jobs — Design

## Goal

Convert the two slow AI-backed recipe endpoints — import (`POST /recipes/import`: URL/text/PDF/DOCX/photo) and AI-generate (`POST /recipes/ai-generate`) — from synchronous request/response into background jobs. The endpoint returns immediately with a job id; the work runs in the background; the frontend shows a progress toast that updates in place to success/failure with a link to the result; a dedicated page lists all past jobs; and since job state lives in Mongo, progress is visible from any device the user is signed into.

## Background

Both endpoints currently do the same expensive AI work synchronously inside the HTTP request, which caused a real production failure: PDF import routinely takes longer than nginx's default `proxy_read_timeout` (60s), producing a 504 the browser reports as a raw network error (see the `proxy_read_timeout` bump in `nginx.conf`, which stays as harmless headroom but doesn't fix the underlying problem — the user is still stuck on one page for the full duration, with no way to navigate away or recover from a dropped connection).

`RecipeImportController` and `RecipeAiGenerateController` already share nearly identical logic after their respective service calls: resolve ingredient-to-recipe links (`RecipeImportService.resolveLinks`), validate each candidate recipe (`class-validator`, whitelist), create each as a draft (`RecipesService.createDraft(userId, dto, { pendingReview: true, batchId })`), then apply within-batch links. The only difference today is that `RecipeImportController` special-cases a single-recipe result to return it unsaved (for a live prefill-and-edit flow) instead of persisting it — this design removes that special case (see below).

## Data Model

New collection, `api/src/jobs/schemas/job.schema.ts`:

```ts
@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, enum: ['import', 'ai_generate'] })
  type!: 'import' | 'ai_generate'

  @Prop({ required: true, enum: ['queued', 'running', 'done', 'failed'], default: 'queued', index: true })
  status!: 'queued' | 'running' | 'done' | 'failed'

  // Human-readable description shown in the toast/jobs page - the source
  // URL/filename for imports, the query text for AI-generate.
  @Prop()
  label?: string

  // No result payload is stored here - a finished job just points at
  // recipes that already exist in the Recipe collection (created as
  // pendingReview drafts, same as the existing batch-import/bulk-generate
  // flow), so the jobs page and toast link straight to them.
  @Prop({ type: [String], default: [] })
  resultRecipeIds!: string[]

  @Prop()
  error?: string

  @Prop()
  startedAt?: Date

  @Prop()
  finishedAt?: Date
}
```

## Backend Execution Model

`JobsService` (`api/src/jobs/jobs.service.ts`):

- `create(userId, type, label?): Promise<JobDocument>` — inserts a `status: 'queued'` job, returns it immediately.
- `run(jobId, fn: () => Promise<string[]>): Promise<void>` — sets `status: 'running'`/`startedAt`, awaits `fn()` (the actual import/generate work, returning the created recipe ids), then sets `status: 'done'`/`finishedAt`/`resultRecipeIds` on success, or `status: 'failed'`/`finishedAt`/`error: err.message` on rejection. Never throws — callers invoke it without `await` and don't need a `.catch()`.
- `listMine(userId, activeOnly?): Promise<JobDocument[]>` — sorted newest-first, capped at 50.
- `onModuleInit` — one-time-per-boot sweep: any job still `queued` or `running` gets marked `failed` with `error: 'Interrupted by a server restart - please retry.'`. A fire-and-forget async task has no way to survive a pod restart (this app redeploys frequently), so a job stuck mid-flight when the process dies would otherwise sit as `running` forever. Same "backfill on boot" pattern as `RecipesService.onModuleInit`.

`RecipeImportController`/`RecipeAiGenerateController` each shrink to:

```ts
@Post()
async import(@Body() body, @Req() req, @UploadedFiles() files) {
  // ...existing validation of the request shape stays (must provide text/url/file/image, etc.)...
  const job = await this.jobsService.create(req.userId, 'import', labelFor(body, files))
  void this.jobsService.run(job.id, () => this.runImport(body, files, req.userId))
  return { jobId: job.id }
}

private async runImport(body, files, userId): Promise<string[]> {
  // ...exact existing logic: importService.importFrom*, resolveLinks,
  // per-recipe validation, createDraft loop, within-batch link application...
  // returns the array of created recipe ids (length 1 for a single import,
  // same as a multi-recipe batch already does today)
}
```

The single-recipe "return unsaved for live prefill" branch is removed — every import result (1 recipe or many) is now created as a `pendingReview` draft with a `batchId`, same as today's multi-recipe path. This is what the async model requires anyway (the user isn't sitting on the page waiting for a hand-off), and it means `RecipeImportController`/`RecipeAiGenerateController` no longer need two different result shapes at all — always an array of recipe ids.

`GET /jobs` (`api/src/jobs/jobs.controller.ts`) — returns `listMine(req.userId)`.

## Frontend

**`JobsProvider`** (`src/context/JobsProvider.tsx`), mounted once in `App.tsx` alongside the existing toast provider — not page-scoped, so progress survives navigation.

- Polls `GET /jobs?status=active` (queued + running) every 3s via the existing `usePolling` hook, regardless of which page is mounted.
- Keeps a `Map<jobId, toastId>` in a ref for jobs it's currently showing as active.
- On each poll: for any active job not yet in the map, open a sticky toast (`toastManager.add({ description: label, type: 'info', timeout: 0 })`, base-ui's toast manager already supports this) and record its `toastId`. For a job previously in the map that's no longer in the active list (it finished), fetch its final state and `toastManager.update(toastId, { description: ..., type: 'success'|'error', timeout: TOAST_DURATION_MS })` — converting the sticky progress toast into a normal auto-dismissing result toast, with a link to the recipe (single result) or the drafts panel (multiple results). Remove it from the map afterward.
- A job that completes between polls without ever appearing in this tab's active list (e.g. finished within one 3s window, or started on another device and already done by the time this tab polls) is not retroactively toasted — it simply appears on the jobs page. This avoids surprising "done!" toasts for work the user never saw start.

**`RecipeImportPage`/`RecipeAiGeneratePage`** (wherever the AI-generate query form lives) — `importRecipe`/the generate call now resolve with `{ jobId }` instead of the recipe(s). The page shows a brief "started" toast/redirect (e.g. back to Home or the drafts panel) instead of blocking on the network call — no more spinner-locked page for the duration of the AI work.

**`/jobs` page** (`src/components/JobsPage.tsx`) — lists `useJobs()` (a simple `GET /jobs` fetch, no need to share the provider's active-only poll), each row showing type, label, status, a relative timestamp, and — for `done` jobs — a link to the resulting recipe (or "N recipes" linking to the drafts panel for a batch). Failed jobs show the error message.

## Testing

- `JobsService`: unit tests for `create`/`run` (success and failure paths, confirming `resultRecipeIds`/`error`/timestamps are set correctly) and the boot-sweep marking stale jobs failed.
- `RecipeImportController`/`RecipeAiGenerateController`: unit tests confirming the endpoint returns `{ jobId }` synchronously without waiting for the background work to complete (mock `JobsService.run` to never resolve during the test and assert the HTTP handler still returns).
- Frontend: no dedicated component-test harness exists in this repo (per precedent from the duplicate-detection and dish-grouping features) — verified via `npm run build`/lint, consistent with those features.

## Out of Scope

- Real-time push (SSE/WebSocket) — polling is the deliberate choice for this app's scale, per earlier discussion; can be revisited if 3s polling feels laggy in practice.
- Job cancellation/retry from the UI — not requested.
- Any change to the nginx `proxy_read_timeout` bump — left as-is, now moot for these two endpoints (which return in well under a second) but harmless.
- Migrating any other endpoint (nutrition estimate, image enhance, etc.) to this job model — only the two endpoints that actually run multi-recipe AI extraction/generation are in scope.
