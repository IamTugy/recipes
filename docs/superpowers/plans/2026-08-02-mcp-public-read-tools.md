# MCP Public Read Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone browse/search published recipes through the MCP server (`mcp.tugy.dev/mcp`) with zero credentials, while every existing private/mutating tool keeps requiring the current shared bearer token unchanged.

**Architecture:** Add one new public backend endpoint for single-recipe lookups. In the MCP server, rename the existing private single-recipe tool, add two new public tools that call the backend using the server's own service credential (never the caller's), and change the Express request handler to only require the caller's bearer token when the invoked tool is not in the public set.

**Tech Stack:** NestJS/Mongoose (`api/`), `@modelcontextprotocol/sdk` + Express (`mcp/`), Jest for backend tests.

## Global Constraints

- Never use the em dash character in any code comment, commit message, or doc text — use a hyphen, comma, or restructure the sentence (project-wide writing style rule).
- Existing private tools (`list_my_recipes`, `create_recipe`, `update_recipe`, `upload_recipe_photo`, `submit_recipe_for_review`) must keep requiring the current shared bearer token with unchanged behavior — no regression.
- Public tools must never expose draft, pending-review, rejected, or hidden recipe content - only ever-published, non-hidden data.
- This plan spec is `docs/superpowers/specs/2026-08-02-public-mcp-oauth-design.md`, Phase 1 section only.

---

### Task 1: Backend public single-recipe endpoint

**Files:**
- Modify: `api/src/recipes/recipes.controller.ts`
- Test: `api/src/recipes/recipes.controller.spec.ts`

**Interfaces:**
- Consumes: `RecipesService.findBySlug(slug: string): Promise<RecipeDocument | null>` (already exists at `api/src/recipes/recipes.service.ts:201`, already excludes hidden and never-published recipes).
- Produces: `GET /recipes/public/:slug` route. Returns the recipe object on success, 404 (`NotFoundException`) when `findBySlug` returns `null`.

- [ ] **Step 1: Write the failing test**

Add to `api/src/recipes/recipes.controller.spec.ts`, near the other `GET /recipes/:slug` tests:

```typescript
  it('GET /recipes/public/:slug returns the recipe when ever-published and not hidden', async () => {
    recipesService.findBySlug.mockResolvedValue({ slug: 'a', title: 'A' })
    const controller = makeController()

    await expect(controller.findPublic('a')).resolves.toEqual({ slug: 'a', title: 'A' })
    expect(recipesService.findBySlug).toHaveBeenCalledWith('a')
  })

  it('GET /recipes/public/:slug throws 404 when never published, hidden, or missing', async () => {
    recipesService.findBySlug.mockResolvedValue(null)
    const controller = makeController()

    await expect(controller.findPublic('missing')).rejects.toThrow(NotFoundException)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest recipes.controller.spec.ts`
Expected: FAIL with `controller.findPublic is not a function`

- [ ] **Step 3: Write minimal implementation**

In `api/src/recipes/recipes.controller.ts`, add this method. Place it directly above the existing `@Get(':slug')` `findOne` method (route ordering matters in NestJS/Express - a literal segment like `public` must be declared before the `:slug` wildcard route, or `:slug` would swallow requests to `/recipes/public/xyz` by matching `slug = "public"` first... actually NestJS matches routes in declaration order per controller, so declaring `public/:slug` before the bare `:slug` route is what makes this work correctly):

```typescript
  @Get('public/:slug')
  async findPublic(@Param('slug') slug: string) {
    const recipe = await this.recipesService.findBySlug(slug)
    if (!recipe) {
      throw new NotFoundException(`Recipe '${slug}' not found`)
    }
    return recipe
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx jest recipes.controller.spec.ts`
Expected: PASS (all tests in the file, not just the two new ones - confirm no route-ordering regression on the existing `:slug`, `:slug/revisions`, `chef/:userId`, `admin/submissions`, `trending`, `mine` tests)

- [ ] **Step 5: Run the full backend suite**

Run: `cd api && npx jest`
Expected: PASS, all suites (should be 179 passing: 177 existing + 2 new)

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/recipes/recipes.controller.ts api/src/recipes/recipes.controller.spec.ts
git commit -m "feat: add public single-recipe endpoint for anonymous MCP reads"
```

---

### Task 2: MCP recipesApi.ts - per-call bearer override and public fetch functions

**Files:**
- Modify: `mcp/src/recipesApi.ts`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces:
  - `request<T>(path: string, init?: RequestInit, bearer?: string): Promise<T>` (bearer defaults to the module's own `API_KEY` when omitted - existing calls to `request()` in this file are unaffected since they don't pass a third argument).
  - `getPublicRecipe(slug: string): Promise<unknown>` - calls `GET /recipes/public/${slug}`.
  - `listPublicRecipes(): Promise<unknown[]>` - calls `GET /recipes`.
  - `getMyRecipe(slug: string): Promise<unknown>` - renamed from the current `getRecipe`, calls `GET /recipes/${slug}` (unchanged path/behavior, only the exported name changes).

- [ ] **Step 1: Add the bearer parameter to `request`, rename `getRecipe`, add the two new public functions**

Replace the full contents of `mcp/src/recipesApi.ts` with:

```typescript
const BASE_URL = process.env.RECIPES_API_BASE_URL ?? 'https://recipes.tugy.dev/api'
const API_KEY = process.env.RECIPES_API_KEY

if (!API_KEY) {
  throw new Error('Set RECIPES_API_KEY to the same key configured on the recipes API')
}

export class RecipesApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit, bearer: string = API_KEY!): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new RecipesApiError(res.status, body || `Request to ${path} failed with ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function listMyRecipes() {
  return request<unknown[]>('/recipes/mine')
}

export function getMyRecipe(slug: string) {
  return request<unknown>(`/recipes/${encodeURIComponent(slug)}`)
}

export function listPublicRecipes() {
  return request<unknown[]>('/recipes')
}

export function getPublicRecipe(slug: string) {
  return request<unknown>(`/recipes/public/${encodeURIComponent(slug)}`)
}

export function createRecipe(body: Record<string, unknown>) {
  return request<{ slug: string }>('/recipes', { method: 'POST', body: JSON.stringify(body) })
}

export function updateRecipe(slug: string, body: Record<string, unknown>) {
  return request<{ slug: string }>(`/recipes/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) })
}

export function submitForReview(slug: string) {
  return request<unknown>(`/recipes/${encodeURIComponent(slug)}/submit`, { method: 'POST' })
}

export async function presignAndUploadPhoto(recipeSlug: string, imageBase64: string, contentType: string): Promise<string> {
  const { uploadUrl, publicUrl } = await request<{ uploadUrl: string; publicUrl: string }>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ recipeSlug, contentType, purpose: 'recipe' }),
  })
  const buffer = Buffer.from(imageBase64, 'base64')
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  })
  if (!putRes.ok) throw new RecipesApiError(putRes.status, 'Failed to upload photo to storage')
  return publicUrl
}
```

- [ ] **Step 2: Type-check**

Run: `cd mcp && npx tsc --noEmit`
Expected: fails, because `mcp/src/index.ts` still imports `getRecipe` (renamed away) - this is expected, Task 3 fixes it. Confirm the only error is the missing `getRecipe` import in `index.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/recipesApi.ts
git commit -m "feat: add public recipe fetch functions and per-call bearer override to MCP client"
```

---

### Task 3: MCP index.ts - public tools, renamed private tool, per-tool auth gating

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: `getMyRecipe`, `listPublicRecipes`, `getPublicRecipe` from `mcp/src/recipesApi.ts` (Task 2).
- Produces: `createServer(): McpServer` (unchanged signature) now registers two additional tools, `list_recipes` and `get_recipe` (public), and renames the previous private `get_recipe` tool to `get_my_recipe`. The Express handler in `main()` computes a `PUBLIC_TOOLS` set and only enforces the bearer check for tool calls not in that set.

- [ ] **Step 1: Add the two public tools and rename the private one**

In `mcp/src/index.ts`, update the import line:

```typescript
import {
  createRecipe,
  getMyRecipe,
  getPublicRecipe,
  listMyRecipes,
  listPublicRecipes,
  presignAndUploadPhoto,
  RecipesApiError,
  submitForReview,
  updateRecipe,
} from './recipesApi.js'
```

Replace the existing `get_recipe` tool registration (currently `server.registerTool('get_recipe', ...)` calling `getRecipe(slug)`) with:

```typescript
  server.registerTool(
    'get_my_recipe',
    {
      title: 'Get one of my recipes',
      description: 'Fetches a single recipe you own by its slug, including drafts, pending review, and rejected ones.',
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      try {
        return textResult(JSON.stringify(await getMyRecipe(slug), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'list_recipes',
    {
      title: 'Browse published recipes',
      description: 'Lists every published recipe on the site. No login required.',
    },
    async () => {
      try {
        return textResult(JSON.stringify(await listPublicRecipes(), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'get_recipe',
    {
      title: 'Get a published recipe',
      description: 'Fetches a single published recipe by its slug. No login required.',
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      try {
        return textResult(JSON.stringify(await getPublicRecipe(slug), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
  )
```

Place these three registrations where the old `get_recipe` registration was (right after `list_my_recipes`, before `create_recipe`).

- [ ] **Step 2: Change the Express handler to gate per-tool instead of per-request**

Replace the `app.post('/mcp', ...)` handler body in `main()` with:

```typescript
  const PUBLIC_TOOLS = new Set(['list_recipes', 'get_recipe'])

  app.post('/mcp', async (req, res) => {
    const apiKey = process.env.RECIPES_API_KEY
    const authHeader = req.headers.authorization
    const isAuthed = !!apiKey && authHeader === `Bearer ${apiKey}`

    const body = req.body as { method?: string; params?: { name?: string } } | undefined
    const isToolCall = body?.method === 'tools/call'
    const toolName = isToolCall ? body?.params?.name : undefined
    const requiresAuth = isToolCall && !PUBLIC_TOOLS.has(toolName ?? '')

    if (requiresAuth && !isAuthed) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const server = createServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })
```

This allows every non-`tools/call` JSON-RPC method (`initialize`, `tools/list`, `ping`, etc.) through unauthenticated too, so any client can discover the tool list without a token - enforcement happens only at actual tool invocation.

- [ ] **Step 3: Type-check**

Run: `cd mcp && npx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 4: Build**

Run: `cd mcp && npm run build`
Expected: PASS, `dist/index.js` produced

- [ ] **Step 5: Manual local verification**

Run the server locally on a port and confirm both tiers behave correctly:

```bash
cd mcp && PORT=3999 RECIPES_API_KEY=$(kubectl get secret -n apps recipes-mcp-apikey -o jsonpath='{.data.apiKey}' | base64 -d) RECIPES_API_BASE_URL=https://recipes.tugy.dev/api node dist/index.js &
sleep 1

# tools/list with no Authorization header must succeed
curl -s -X POST http://localhost:3999/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# calling the public "list_recipes" tool with no Authorization header must succeed
curl -s -X POST http://localhost:3999/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_recipes","arguments":{}}}'

# calling the private "list_my_recipes" tool with no Authorization header must 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3999/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_my_recipes","arguments":{}}}'

kill %1
```

Expected: `tools/list` returns a tool listing (SSE-framed JSON), `list_recipes` call returns recipe data, `list_my_recipes` call returns `401`.

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts
git commit -m "feat: add public browse/search MCP tools, gate auth per-tool instead of per-request"
```

---

### Task 4: Deploy and verify live

**Files:** none (deploy-only task)

**Interfaces:** none

- [ ] **Step 1: Push and watch CI**

```bash
cd /Users/tugy/git/recipes
git push
gh run list --repo IamTugy/recipes --branch main --limit 1
```

Wait for the run to complete (use `gh run watch <id> --repo IamTugy/recipes --exit-status`). Expected: `success`.

- [ ] **Step 2: Wait for the server-repo deploy workflow to trigger and complete**

```bash
gh run list --repo IamTugy/server --limit 1
```

Wait for it to complete (`gh run watch <id> --repo IamTugy/server --exit-status`). Expected: `success`.

- [ ] **Step 3: Verify the deployed pods match the new commit**

```bash
SHA=$(git rev-parse --short HEAD)
echo "expect $SHA"
kubectl get deploy -n apps recipes-api -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl rollout status deploy/recipes-api -n apps --timeout=90s
kubectl get deploy -n apps recipes-mcp -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl rollout status deploy/recipes-mcp -n apps --timeout=90s
```

Expected: both images end in `:sha-$SHA` (or a later commit if more landed since), and both rollouts report success.

- [ ] **Step 4: Verify against the live MCP server with no credentials at all**

```bash
curl -s -X POST https://mcp.tugy.dev/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -s -X POST https://mcp.tugy.dev/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_recipes","arguments":{}}}'

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mcp.tugy.dev/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_recipe","arguments":{"title":"should not work"}}}'
```

Expected: first two succeed with no `Authorization` header at all (published recipe data comes back), third returns `401`. If the third does NOT 401, stop and treat it as a live incident - do not leave a public write hole live.

- [ ] **Step 5: Verify the private tools still work end-to-end with the existing shared key (no regression)**

```bash
KEY=$(kubectl get secret -n apps recipes-mcp-apikey -o jsonpath='{.data.apiKey}' | base64 -d)
curl -s -X POST https://mcp.tugy.dev/mcp -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_my_recipes","arguments":{}}}'
```

Expected: succeeds, returns the owner's recipes (same as before this plan).
