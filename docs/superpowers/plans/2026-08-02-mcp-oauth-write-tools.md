# MCP Per-User OAuth for Write Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a stranger sign in as themselves (an existing recipes.tugy.dev / Clerk account) through ChatGPT/Gemini and manage their own recipes via the MCP write tools, instead of every write happening as the fixed owner account.

**Architecture:** The MCP server becomes a thin OAuth 2.1 authorization server implementing Dynamic Client Registration, proxying the actual login/consent to one pre-registered Clerk OAuth Application. Redis stores ephemeral DCR client registrations and pending authorization-code correlations. Write-tool calls forward the resolved per-user Clerk token straight through to `recipes-api`, which already knows how to verify real Clerk tokens.

**Tech Stack:** `mcp/` (Express, `@modelcontextprotocol/sdk`, new deps: `ioredis`, `jose`), `api/` (NestJS, `@clerk/backend`, only touched if the token-compatibility spike in Task 1 fails).

## Global Constraints

- Never use the em dash character in any code comment, commit message, or doc text.
- Public read tools (`list_recipes`, `get_recipe`) and their no-auth behavior from the prior plan (`docs/superpowers/plans/2026-08-02-mcp-public-read-tools.md`) must not regress.
- The existing shared-bearer-token path (`RECIPES_API_KEY` as `Bearer` token, mapping to `OWNER_USER_ID`) must keep working unchanged after this plan - it is the fallback used by the owner's own tooling and must not be removed.
- This plan is Phase 2 of `docs/superpowers/specs/2026-08-02-public-mcp-oauth-design.md`.
- **External dependency, blocks Task 5 onward:** a Clerk OAuth Application must exist (client ID, client secret, redirect URI `https://mcp.tugy.dev/oauth_callback`, scopes `openid email profile`). Only the user can create this via the Clerk dashboard - stop and ask if you reach Task 5 without it.

---

### Task 1: Token-compatibility spike

**Files:** none (investigation only, produces a decision recorded in this plan file)

**Interfaces:** none yet - this determines whether Task 9 uses the "relay" path or the "self-signed JWT" fallback path.

- [ ] **Step 1: Once the Clerk OAuth Application exists, manually drive one OAuth login**

Using a throwaway PKCE test script or a browser, complete one full Authorization Code flow directly against Clerk's own endpoints (bypassing our proxy entirely, just to get a real token to inspect):

1. Build the Clerk authorize URL: `https://<your-clerk-frontend-api-domain>/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=https://mcp.tugy.dev/oauth_callback&scope=openid+email+profile&state=spike&code_challenge=<S256_CHALLENGE>&code_challenge_method=S256`
2. Log in as an existing recipes.tugy.dev user, note the `code` param Clerk redirects back with.
3. Exchange it: `curl -X POST https://<clerk-frontend-api-domain>/oauth/token -d "grant_type=authorization_code&code=<CODE>&redirect_uri=https://mcp.tugy.dev/oauth_callback&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&code_verifier=<VERIFIER>"`
4. Take the returned `access_token` and run it through the exact verification `recipes-api` uses:

```bash
cd api && node -e "
const { verifyToken } = require('@clerk/backend')
verifyToken('<ACCESS_TOKEN>', { secretKey: process.env.CLERK_SECRET_KEY })
  .then(payload => console.log('VERIFIED', JSON.stringify(payload)))
  .catch(err => console.log('FAILED', err.message))
"
```

- [ ] **Step 2: Record the outcome in this file**

Replace this paragraph with one of:
- "SPIKE RESULT: relay works - `verifyToken` accepted the Clerk OAuth access token directly, payload.sub was the correct Clerk user ID." → proceed with Task 9's relay path, skip Task 12.
- "SPIKE RESULT: relay failed - `verifyToken` rejected the Clerk OAuth access token (reason: <paste error>)." → use Task 9's self-signed-JWT fallback path, and execute Task 12.

No commit for this task - it only produces the decision recorded above, used by later tasks.

---

### Task 2: MCP Redis client and ephemeral store

**Files:**
- Create: `mcp/src/oauthStore.ts`
- Create: `mcp/src/oauthStore.test.ts`
- Modify: `mcp/package.json` (add `ioredis` dependency)

**Interfaces:**
- Produces:
  - `registerClient(metadata: { redirectUris: string[]; clientName?: string }): Promise<{ clientId: string; clientSecret: string }>`
  - `getClient(clientId: string): Promise<{ redirectUris: string[]; clientSecret: string } | null>`
  - `storePendingAuthorization(state: string, data: { clientId: string; redirectUri: string; codeChallenge: string; clientState: string }): Promise<void>` (TTL 10 minutes)
  - `takePendingAuthorization(state: string): Promise<{ clientId: string; redirectUri: string; codeChallenge: string; clientState: string } | null>` (fetch-and-delete, so a state can only be consumed once)
  - `storeAuthCode(code: string, data: { clerkAccessToken: string; codeChallenge: string; redirectUri: string; clientId: string }): Promise<void>` (TTL 2 minutes)
  - `takeAuthCode(code: string): Promise<{ clerkAccessToken: string; codeChallenge: string; redirectUri: string; clientId: string } | null>` (fetch-and-delete)

- [ ] **Step 1: Add ioredis dependency**

```bash
cd /Users/tugy/git/recipes/mcp
npm install ioredis@^5.4.1
```

- [ ] **Step 2: Write the failing test**

Create `mcp/src/oauthStore.test.ts` using Node's built-in test runner (no new test framework dependency) against a real local Redis is not available in CI, so use `ioredis-mock` instead:

```bash
npm install --save-dev ioredis-mock@^8.9.0
```

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import RedisMock from 'ioredis-mock'
import { createOAuthStore } from './oauthStore.js'

test('registerClient produces a client that getClient can look up', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  const { clientId, clientSecret } = await store.registerClient({ redirectUris: ['https://example.com/cb'] })
  assert.ok(clientId.length > 0)
  assert.ok(clientSecret.length > 0)

  const client = await store.getClient(clientId)
  assert.deepEqual(client?.redirectUris, ['https://example.com/cb'])
  assert.equal(client?.clientSecret, clientSecret)
})

test('getClient returns null for an unknown client id', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  assert.equal(await store.getClient('nope'), null)
})

test('pending authorization can be taken exactly once', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  await store.storePendingAuthorization('state1', {
    clientId: 'c1', redirectUri: 'https://example.com/cb', codeChallenge: 'challenge', clientState: 'orig-state',
  })

  const first = await store.takePendingAuthorization('state1')
  assert.deepEqual(first, { clientId: 'c1', redirectUri: 'https://example.com/cb', codeChallenge: 'challenge', clientState: 'orig-state' })

  const second = await store.takePendingAuthorization('state1')
  assert.equal(second, null)
})

test('auth code can be taken exactly once', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  await store.storeAuthCode('code1', {
    clerkAccessToken: 'tok', codeChallenge: 'challenge', redirectUri: 'https://example.com/cb', clientId: 'c1',
  })

  const first = await store.takeAuthCode('code1')
  assert.deepEqual(first, { clerkAccessToken: 'tok', codeChallenge: 'challenge', redirectUri: 'https://example.com/cb', clientId: 'c1' })

  const second = await store.takeAuthCode('code1')
  assert.equal(second, null)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mcp && node --experimental-strip-types --test src/oauthStore.test.ts` (or after adding a `"test"` script per Step 5, use that)
Expected: FAIL, `oauthStore.js` does not exist / `createOAuthStore` is not exported

- [ ] **Step 4: Write the implementation**

Create `mcp/src/oauthStore.ts`:

```typescript
import { randomBytes } from 'node:crypto'
import type Redis from 'ioredis'

interface ClientRecord {
  redirectUris: string[]
  clientSecret: string
}

interface PendingAuthorization {
  clientId: string
  redirectUri: string
  codeChallenge: string
  clientState: string
}

interface AuthCodeRecord {
  clerkAccessToken: string
  codeChallenge: string
  redirectUri: string
  clientId: string
}

const PENDING_AUTHORIZATION_TTL_SECONDS = 10 * 60
const AUTH_CODE_TTL_SECONDS = 2 * 60

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

export function createOAuthStore(redis: Redis) {
  return {
    async registerClient(metadata: { redirectUris: string[]; clientName?: string }) {
      const clientId = randomToken(16)
      const clientSecret = randomToken(32)
      const record: ClientRecord = { redirectUris: metadata.redirectUris, clientSecret }
      await redis.set(`oauth:client:${clientId}`, JSON.stringify(record))
      return { clientId, clientSecret }
    },

    async getClient(clientId: string): Promise<ClientRecord | null> {
      const raw = await redis.get(`oauth:client:${clientId}`)
      return raw ? (JSON.parse(raw) as ClientRecord) : null
    },

    async storePendingAuthorization(state: string, data: PendingAuthorization): Promise<void> {
      await redis.set(`oauth:pending:${state}`, JSON.stringify(data), 'EX', PENDING_AUTHORIZATION_TTL_SECONDS)
    },

    async takePendingAuthorization(state: string): Promise<PendingAuthorization | null> {
      const key = `oauth:pending:${state}`
      const raw = await redis.get(key)
      if (!raw) return null
      await redis.del(key)
      return JSON.parse(raw) as PendingAuthorization
    },

    async storeAuthCode(code: string, data: AuthCodeRecord): Promise<void> {
      await redis.set(`oauth:code:${code}`, JSON.stringify(data), 'EX', AUTH_CODE_TTL_SECONDS)
    },

    async takeAuthCode(code: string): Promise<AuthCodeRecord | null> {
      const key = `oauth:code:${code}`
      const raw = await redis.get(key)
      if (!raw) return null
      await redis.del(key)
      return JSON.parse(raw) as AuthCodeRecord
    },
  }
}
```

- [ ] **Step 5: Add a test script and run it**

Add to `mcp/package.json` scripts: `"test": "node --experimental-strip-types --test src/**/*.test.ts"`

Run: `cd mcp && npm test`
Expected: PASS, 4 tests

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/package.json mcp/package-lock.json mcp/src/oauthStore.ts mcp/src/oauthStore.test.ts
git commit -m "feat: add Redis-backed ephemeral store for MCP OAuth proxy"
```

---

### Task 3: PKCE helpers

**Files:**
- Create: `mcp/src/pkce.ts`
- Create: `mcp/src/pkce.test.ts`

**Interfaces:**
- Produces: `verifyPkce(codeVerifier: string, codeChallenge: string): boolean` - implements RFC 7636 S256: `base64url(sha256(codeVerifier)) === codeChallenge`.

- [ ] **Step 1: Write the failing test**

Create `mcp/src/pkce.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyPkce } from './pkce.js'

test('verifyPkce accepts a matching S256 challenge/verifier pair', () => {
  const verifier = 'a'.repeat(64)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  assert.equal(verifyPkce(verifier, challenge), true)
})

test('verifyPkce rejects a non-matching pair', () => {
  assert.equal(verifyPkce('a'.repeat(64), 'not-the-right-challenge'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL, `pkce.js` does not exist

- [ ] **Step 3: Write the implementation**

Create `mcp/src/pkce.ts`:

```typescript
import { createHash } from 'node:crypto'

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url')
  return computed === codeChallenge
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npm test`
Expected: PASS, 6 tests total (4 from Task 2 plus 2 new)

- [ ] **Step 5: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/pkce.ts mcp/src/pkce.test.ts
git commit -m "feat: add PKCE S256 verification helper for MCP OAuth proxy"
```

---

### Task 4: OAuth authorization server metadata endpoint

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GET /.well-known/oauth-authorization-server` returning AS metadata JSON.

- [ ] **Step 1: Add the route in `main()`, before the existing `app.post('/mcp', ...)` handler**

```typescript
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    const base = process.env.MCP_PUBLIC_URL ?? 'https://mcp.tugy.dev'
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    })
  })
```

- [ ] **Step 2: Manual verification**

```bash
cd mcp && npm run build
PORT=3999 RECIPES_API_KEY=test RECIPES_API_BASE_URL=https://recipes.tugy.dev/api node dist/index.js &
sleep 1
curl -s http://localhost:3999/.well-known/oauth-authorization-server | python3 -m json.tool
kill %1
```

Expected: JSON with the five endpoint fields, `issuer` = `https://mcp.tugy.dev` (or `MCP_PUBLIC_URL` if set).

- [ ] **Step 3: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts
git commit -m "feat: add OAuth authorization server metadata endpoint"
```

---

### Task 5: Dynamic Client Registration endpoint

**STOP before starting this task if the Clerk OAuth Application (Task 1's prerequisite) does not exist yet - ask the user for its client ID, client secret, and confirm the redirect URI is registered as `https://mcp.tugy.dev/oauth_callback`.**

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: `createOAuthStore` from `mcp/src/oauthStore.ts` (Task 2).
- Produces: `POST /register` - accepts `{ redirect_uris: string[], client_name?: string }`, returns `{ client_id: string, client_secret: string, redirect_uris: string[] }` per RFC 7591.

- [ ] **Step 1: Wire up the Redis connection and store in `main()`**

Add near the top of `main()`, before the route definitions:

```typescript
  const Redis = (await import('ioredis')).default
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis.apps.svc.cluster.local:6379')
  const oauthStore = createOAuthStore(redis)
```

Add the import at the top of the file: `import { createOAuthStore } from './oauthStore.js'`

- [ ] **Step 2: Add the `/register` route**

```typescript
  app.post('/register', async (req, res) => {
    const redirectUris = req.body?.redirect_uris
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u: unknown) => typeof u === 'string')) {
      res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of strings' })
      return
    }
    const { clientId, clientSecret } = await oauthStore.registerClient({ redirectUris, clientName: req.body?.client_name })
    res.status(201).json({ client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris })
  })
```

- [ ] **Step 3: Manual verification**

```bash
cd mcp && npm run build
kubectl port-forward -n apps svc/redis 6380:6379 &
PORT_FORWARD_PID=$!
sleep 1
PORT=3999 REDIS_URL=redis://localhost:6380 RECIPES_API_KEY=test RECIPES_API_BASE_URL=https://recipes.tugy.dev/api node dist/index.js &
sleep 1

curl -s -X POST http://localhost:3999/register -H "Content-Type: application/json" -d '{"redirect_uris":["https://example.com/cb"],"client_name":"test client"}'

kill %1
kill $PORT_FORWARD_PID
```

Expected: 201 with `client_id`, `client_secret`, `redirect_uris` echoed back.

- [ ] **Step 4: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts
git commit -m "feat: add OAuth Dynamic Client Registration endpoint"
```

---

### Task 6: /authorize endpoint

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: `oauthStore.getClient`, `oauthStore.storePendingAuthorization` (Task 2/5).
- Produces: `GET /authorize` - validates the AI client's request, redirects to Clerk's real authorize endpoint.

- [ ] **Step 1: Add environment-driven Clerk constants near the top of `main()`**

```typescript
  const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API!
  const CLERK_OAUTH_CLIENT_ID = process.env.CLERK_OAUTH_CLIENT_ID!
  const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? 'https://mcp.tugy.dev'
```

- [ ] **Step 2: Add the `/authorize` route**

```typescript
  app.get('/authorize', async (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod, state: clientState } = req.query as Record<string, string | undefined>

    if (!clientId || !redirectUri || !codeChallenge || !clientState) {
      res.status(400).send('Missing required parameters: client_id, redirect_uri, code_challenge, state')
      return
    }
    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      res.status(400).send('Only S256 code_challenge_method is supported')
      return
    }
    const client = await oauthStore.getClient(clientId)
    if (!client || !client.redirectUris.includes(redirectUri)) {
      res.status(400).send('Unknown client_id or redirect_uri does not match registration')
      return
    }

    const proxyState = randomToken(24)
    await oauthStore.storePendingAuthorization(proxyState, { clientId, redirectUri, codeChallenge, clientState })

    const clerkAuthorizeUrl = new URL(`${CLERK_FRONTEND_API}/oauth/authorize`)
    clerkAuthorizeUrl.searchParams.set('response_type', 'code')
    clerkAuthorizeUrl.searchParams.set('client_id', CLERK_OAUTH_CLIENT_ID)
    clerkAuthorizeUrl.searchParams.set('redirect_uri', `${MCP_PUBLIC_URL}/oauth_callback`)
    clerkAuthorizeUrl.searchParams.set('scope', 'openid email profile')
    clerkAuthorizeUrl.searchParams.set('state', proxyState)
    res.redirect(clerkAuthorizeUrl.toString())
  })
```

Add `randomToken` as a small shared helper at module scope (top of `index.ts`, alongside `textResult`/`errorResult`):

```typescript
function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}
```

Add `import { randomBytes } from 'node:crypto'` to the top imports.

- [ ] **Step 3: Manual verification (validation paths only - the real redirect needs Task 7 to land before it can be followed end-to-end)**

```bash
cd mcp && npm run build
# (reuse the port-forward + server startup from Task 5's verification)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3999/authorize?client_id=unknown&redirect_uri=https://example.com/cb&code_challenge=x&state=y"
```

Expected: `400` (unknown client_id).

- [ ] **Step 4: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts
git commit -m "feat: add OAuth /authorize endpoint, proxying to Clerk"
```

---

### Task 7: /oauth_callback endpoint

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: `oauthStore.takePendingAuthorization`, `oauthStore.storeAuthCode` (Task 2), `verifyPkce` is NOT used here (PKCE is checked at `/token`, not here) - this endpoint only correlates Clerk's callback back to the original AI-client request and stores the resulting Clerk token.
- Produces: `GET /oauth_callback` - exchanges Clerk's code for a token, stores it, redirects to the AI client's redirect URI with a proxy code.

- [ ] **Step 1: Add Clerk client-secret constant**

```typescript
  const CLERK_OAUTH_CLIENT_SECRET = process.env.CLERK_OAUTH_CLIENT_SECRET!
```

- [ ] **Step 2: Add the `/oauth_callback` route**

```typescript
  app.get('/oauth_callback', async (req, res) => {
    const { code, state: proxyState, error } = req.query as Record<string, string | undefined>
    if (error) {
      res.status(400).send(`Clerk returned an error: ${error}`)
      return
    }
    if (!code || !proxyState) {
      res.status(400).send('Missing code or state from Clerk callback')
      return
    }

    const pending = await oauthStore.takePendingAuthorization(proxyState)
    if (!pending) {
      res.status(400).send('Unknown or expired authorization state')
      return
    }

    let clerkAccessToken: string
    try {
      const tokenRes = await fetch(`${CLERK_FRONTEND_API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${MCP_PUBLIC_URL}/oauth_callback`,
          client_id: CLERK_OAUTH_CLIENT_ID,
          client_secret: CLERK_OAUTH_CLIENT_SECRET,
        }),
      })
      if (!tokenRes.ok) throw new Error(await tokenRes.text())
      const tokenBody = await tokenRes.json() as { access_token: string }
      clerkAccessToken = tokenBody.access_token
    } catch (err) {
      const redirectUrl = new URL(pending.redirectUri)
      redirectUrl.searchParams.set('error', 'server_error')
      redirectUrl.searchParams.set('error_description', err instanceof Error ? err.message : String(err))
      redirectUrl.searchParams.set('state', pending.clientState)
      res.redirect(redirectUrl.toString())
      return
    }

    const proxyCode = randomToken(24)
    await oauthStore.storeAuthCode(proxyCode, {
      clerkAccessToken,
      codeChallenge: pending.codeChallenge,
      redirectUri: pending.redirectUri,
      clientId: pending.clientId,
    })

    const redirectUrl = new URL(pending.redirectUri)
    redirectUrl.searchParams.set('code', proxyCode)
    redirectUrl.searchParams.set('state', pending.clientState)
    res.redirect(redirectUrl.toString())
  })
```

- [ ] **Step 3: Manual verification requires the real Clerk app - defer to Task 10's end-to-end test**

No standalone verification for this task in isolation (it depends on a real redirect from Clerk carrying a real `code`). Proceed to commit; Task 10 exercises this route for real.

- [ ] **Step 4: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts
git commit -m "feat: add OAuth callback endpoint, exchanging Clerk's code for a token"
```

---

### Task 8: /token endpoint

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: `oauthStore.getClient`, `oauthStore.takeAuthCode` (Task 2), `verifyPkce` (Task 3).
- Produces: `POST /token` - exchanges the proxy code (PKCE-verified) for an access token the AI client uses on subsequent write-tool calls.

- [ ] **Step 1: Add the `/token` route**

Note: per Task 1's spike result, this route either relays Clerk's access token directly (if verified compatible) or wraps it (fallback covered in Task 12, added conditionally). Write the relay version first; Task 12 modifies this if the spike failed.

```typescript
  app.post('/token', express.urlencoded({ extended: false }), async (req, res) => {
    const { grant_type: grantType, code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = req.body as Record<string, string | undefined>

    if (grantType !== 'authorization_code') {
      res.status(400).json({ error: 'unsupported_grant_type' })
      return
    }
    if (!code || !redirectUri || !clientId || !codeVerifier) {
      res.status(400).json({ error: 'invalid_request' })
      return
    }

    const authCode = await oauthStore.takeAuthCode(code)
    if (!authCode) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired code' })
      return
    }
    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'client_id or redirect_uri mismatch' })
      return
    }
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' })
      return
    }

    res.json({
      access_token: authCode.clerkAccessToken,
      token_type: 'bearer',
      expires_in: 3600,
    })
  })
```

Add `import { verifyPkce } from './pkce.js'` to the top imports. Note this route needs `express.urlencoded` middleware for this specific route since OAuth token requests are conventionally form-encoded, not JSON (the rest of the app uses `express.json()` globally already, applied earlier in `main()` - adding `express.urlencoded` as a second, route-scoped middleware here does not conflict with that).

- [ ] **Step 2: Manual verification requires a real prior `/authorize` + `/oauth_callback` round trip - covered by Task 10's end-to-end test.**

- [ ] **Step 3: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts
git commit -m "feat: add OAuth /token endpoint with PKCE verification"
```

---

### Task 9: Thread the resolved per-user token into write-tool calls

**Files:**
- Modify: `mcp/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createServer(bearerToken?: string): McpServer` - private tool handlers use `bearerToken` (falling back to the module's shared `RECIPES_API_KEY` when not provided) instead of always using the process-wide key.

- [ ] **Step 1: Change `recipesApi.ts` functions used by private tools to accept an optional bearer override**

In `mcp/src/recipesApi.ts`, update these four exports to accept and forward an optional `bearer` parameter (the `request()` function from the prior plan already supports this as its third argument):

```typescript
export function listMyRecipes(bearer?: string) {
  return request<unknown[]>('/recipes/mine', undefined, bearer)
}

export function getMyRecipe(slug: string, bearer?: string) {
  return request<unknown>(`/recipes/${encodeURIComponent(slug)}`, undefined, bearer)
}

export function createRecipe(body: Record<string, unknown>, bearer?: string) {
  return request<{ slug: string }>('/recipes', { method: 'POST', body: JSON.stringify(body) }, bearer)
}

export function updateRecipe(slug: string, body: Record<string, unknown>, bearer?: string) {
  return request<{ slug: string }>(`/recipes/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) }, bearer)
}

export function submitForReview(slug: string, bearer?: string) {
  return request<unknown>(`/recipes/${encodeURIComponent(slug)}/submit`, { method: 'POST' }, bearer)
}

export async function presignAndUploadPhoto(recipeSlug: string, imageBase64: string, contentType: string, bearer?: string): Promise<string> {
  const { uploadUrl, publicUrl } = await request<{ uploadUrl: string; publicUrl: string }>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ recipeSlug, contentType, purpose: 'recipe' }),
  }, bearer)
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

Since `request()`'s third parameter already has a default of the module's own `API_KEY` (from the prior plan), passing `bearer: undefined` from a tool that has no per-user token falls back to that default automatically - no behavior change for calls that don't pass one.

- [ ] **Step 2: Change `createServer` to accept and close over the resolved bearer token**

In `mcp/src/index.ts`, change the signature and thread `bearerToken` into every private tool's calls to the functions above:

```typescript
function createServer(bearerToken?: string): McpServer {
  const server = new McpServer({ name: 'recipes-mcp', version: '1.0.0' })

  server.registerTool(
    'list_my_recipes',
    { title: 'List my recipes', description: "Lists every recipe owned by the authenticated user, including drafts, pending review, published, and rejected ones." },
    async () => {
      try {
        return textResult(JSON.stringify(await listMyRecipes(bearerToken), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'get_my_recipe',
    { title: 'Get one of my recipes', description: 'Fetches a single recipe you own by its slug, including drafts, pending review, and rejected ones.', inputSchema: { slug: z.string() } },
    async ({ slug }) => {
      try {
        return textResult(JSON.stringify(await getMyRecipe(slug, bearerToken), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  // list_recipes and get_recipe (public tools) are unchanged - they never use bearerToken.

  server.registerTool(
    'create_recipe',
    { title: 'Create a recipe draft', description: 'Creates a new private draft recipe owned by the authenticated user. Only title is required; fill in as much as you can from the source (e.g. a photo of a recipe).', inputSchema: recipeFieldsSchema },
    async (fields) => {
      try {
        const recipe = await createRecipe(fields, bearerToken)
        return textResult(`Created draft recipe with slug "${recipe.slug}". Use upload_recipe_photo to attach a photo, then submit_recipe_for_review when ready.`)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'update_recipe',
    { title: 'Update a recipe', description: 'Updates an existing recipe owned by the authenticated user. Only provided fields are changed; the recipe must not be pending review.', inputSchema: { slug: z.string(), ...Object.fromEntries(Object.entries(recipeFieldsSchema).map(([k, v]) => [k, v.optional()])) } },
    async ({ slug, ...fields }) => {
      try {
        await updateRecipe(slug, fields, bearerToken)
        return textResult(`Updated recipe "${slug}".`)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'upload_recipe_photo',
    { title: 'Upload a recipe photo', description: 'Uploads a photo for a recipe from base64-encoded image data and sets it as the recipe\'s image. A published-quality photo is required before a recipe can be submitted for review.', inputSchema: { slug: z.string(), imageBase64: z.string().describe('Base64-encoded image bytes, no data: URI prefix'), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) } },
    async ({ slug, imageBase64, contentType }) => {
      try {
        const publicUrl = await presignAndUploadPhoto(slug, imageBase64, contentType, bearerToken)
        await updateRecipe(slug, { image: publicUrl }, bearerToken)
        return {
          content: [
            { type: 'text' as const, text: `Uploaded photo and set it on recipe "${slug}": ${publicUrl}` },
            { type: 'image' as const, data: imageBase64, mimeType: contentType },
          ],
        }
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'submit_recipe_for_review',
    { title: 'Submit a recipe for review', description: 'Submits a complete draft recipe for admin review. All fields must be filled in and a real photo uploaded, or this fails listing what is missing.', inputSchema: { slug: z.string() } },
    async ({ slug }) => {
      try {
        await submitForReview(slug, bearerToken)
        return textResult(`Submitted "${slug}" for review.`)
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  return server
}
```

(The `list_recipes` and `get_recipe` tool registrations from the prior plan are unchanged and stay in this function exactly as they are - only shown above where omitted for brevity is the reminder they don't take `bearerToken`.)

- [ ] **Step 3: Resolve the caller's actual bearer token in the Express handler and pass it to `createServer`**

Change the `app.post('/mcp', ...)` handler's auth resolution to compute the token to use, and pass it into `createServer`:

```typescript
  app.post('/mcp', async (req, res) => {
    const apiKey = process.env.RECIPES_API_KEY
    const authHeader = req.headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined
    const isAuthed = !!apiKey && bearerToken === apiKey

    const body = req.body as { method?: string; params?: { name?: string } } | undefined
    const isToolCall = body?.method === 'tools/call'
    const toolName = isToolCall ? body?.params?.name : undefined
    const requiresAuth = isToolCall && !PUBLIC_TOOLS.has(toolName ?? '')

    // Either the legacy shared secret, or (once Task 5-8 land) an OAuth
    // access token minted by our own /token endpoint, authorizes a private
    // tool call. Both are just checked as "is bearerToken present and
    // non-empty" here - the legacy secret is also forwarded to recipes-api
    // as-is, matching today's behavior exactly.
    if (requiresAuth && !bearerToken) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const server = createServer(isAuthed ? apiKey : bearerToken)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })
```

This is a deliberate widening: any non-empty bearer token on a private tool call is now accepted and forwarded as-is to `recipes-api`, which does its own real verification (either matching the shared secret, or verifying a genuine Clerk token). `recipes-api` rejecting an invalid token results in the tool call itself failing with the `RecipesApiError` message (handled by each tool's existing `try/catch` → `errorResult`), not a 401 at the MCP transport layer - this is correct, since the MCP layer can no longer distinguish a valid per-user OAuth token from an invalid one without calling out to Clerk itself, and `recipes-api` is the actual source of truth for token validity.

- [ ] **Step 4: Type-check and build**

Run: `cd mcp && npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Manual regression check - the existing shared-secret flow must be unaffected**

```bash
KEY=$(kubectl get secret -n apps recipes-mcp-apikey -o jsonpath='{.data.apiKey}' | base64 -d)
cd mcp && PORT=3999 RECIPES_API_KEY="$KEY" RECIPES_API_BASE_URL=https://recipes.tugy.dev/api node dist/index.js &
sleep 1
curl -s -X POST http://localhost:3999/mcp -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_my_recipes","arguments":{}}}' | head -c 200
kill %1
```

Expected: succeeds, returns the owner's recipes (same as before).

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add mcp/src/index.ts mcp/src/recipesApi.ts
git commit -m "feat: forward the resolved per-user bearer token to private tool calls"
```

---

### Task 10: k8s manifests and secrets for Phase 2

**Files:**
- Modify: `server` repo (separate git checkout, e.g. `/Users/tugy/git/server`): `k8s/apps/recipes-mcp/deployment.yaml`
- Create: `server` repo: `k8s/apps/recipes-mcp/oauth-sealed-secret.yaml` (via `kubeseal`, not written by hand)

**Interfaces:** none (infra-only task)

- [ ] **Step 1: Create the plaintext secret locally (never commit this file)**

```bash
cat > /tmp/mcp-oauth-secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: recipes-mcp-oauth
  namespace: apps
type: Opaque
stringData:
  clerkOAuthClientId: "<CLIENT_ID from the user>"
  clerkOAuthClientSecret: "<CLIENT_SECRET from the user>"
EOF
```

- [ ] **Step 2: Seal it**

```bash
kubeseal --format=yaml --cert /tmp/sealed-secrets-cert.pem < /tmp/mcp-oauth-secret.yaml > /Users/tugy/git/server/k8s/apps/recipes-mcp/oauth-sealed-secret.yaml
rm /tmp/mcp-oauth-secret.yaml
```

(If the cert isn't cached locally, fetch it first: `kubectl -n sealed-secrets port-forward svc/sealed-secrets-controller 8081:8080 &` then `curl http://localhost:8081/v1/cert.pem -o /tmp/sealed-secrets-cert.pem`.)

- [ ] **Step 3: Add the new env vars to the deployment**

In `/Users/tugy/git/server/k8s/apps/recipes-mcp/deployment.yaml`, add to the `api` container's `env` list:

```yaml
            - name: REDIS_URL
              value: redis://redis.apps.svc.cluster.local:6379
            - name: CLERK_FRONTEND_API
              value: "https://<your-clerk-instance>.clerk.accounts.dev"
            - name: MCP_PUBLIC_URL
              value: https://mcp.tugy.dev
            - name: CLERK_OAUTH_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: recipes-mcp-oauth
                  key: clerkOAuthClientId
            - name: CLERK_OAUTH_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: recipes-mcp-oauth
                  key: clerkOAuthClientSecret
```

Replace `<your-clerk-instance>` with the actual Clerk Frontend API domain shown in the Clerk dashboard for this application.

- [ ] **Step 4: Add the sealed secret to the deploy workflow's apply step**

In `/Users/tugy/git/server/.github/workflows/deploy-recipes.yaml`, find the existing `kubectl apply` line for `k8s/apps/recipes-mcp/sealed-secret.yaml` and add a sibling line applying `k8s/apps/recipes-mcp/oauth-sealed-secret.yaml` alongside it.

- [ ] **Step 5: Commit and push (in the server repo)**

```bash
cd /Users/tugy/git/server
git add k8s/apps/recipes-mcp/deployment.yaml k8s/apps/recipes-mcp/oauth-sealed-secret.yaml .github/workflows/deploy-recipes.yaml
git commit -m "feat: add Redis, Clerk OAuth env vars and sealed secret to recipes-mcp"
git push
```

---

### Task 11: Deploy and end-to-end verify

**Files:** none (deploy-only task)

- [ ] **Step 1: Push the `recipes` repo commits from Tasks 2-9, watch CI, watch the server-repo deploy, verify pod image tags**

Follow the same push → `gh run watch` (recipes repo) → `gh run watch` (server repo) → `kubectl rollout status` → image-tag-match sequence used in the prior plan's Task 4, for both `recipes-api` (only if Task 12 ran) and `recipes-mcp`.

- [ ] **Step 2: End-to-end OAuth flow test with a scripted PKCE client**

```bash
cd /Users/tugy/git/recipes
node -e "
const crypto = require('crypto')

async function main() {
  const reg = await fetch('https://mcp.tugy.dev/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['http://localhost:8734/cb'], client_name: 'e2e test' }),
  }).then(r => r.json())
  console.log('Registered client:', reg.client_id)

  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')

  const authorizeUrl = new URL('https://mcp.tugy.dev/authorize')
  authorizeUrl.searchParams.set('client_id', reg.client_id)
  authorizeUrl.searchParams.set('redirect_uri', 'http://localhost:8734/cb')
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', 'e2e-state')
  console.log('Open this URL in a browser, log in, and paste the code param it redirects to localhost:8734/cb with:')
  console.log(authorizeUrl.toString())
}

main()
"
```

Manually open the printed URL, log in as a test user, and capture the `code` query param from the (failing, since nothing listens on :8734) redirect. Then:

```bash
node -e "
const crypto = require('crypto')
async function main() {
  const verifier = process.argv[1] // paste the same verifier used above - rerun the script above and save it to a variable instead of regenerating, for a real run
  const res = await fetch('https://mcp.tugy.dev/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: process.argv[2],
      redirect_uri: 'http://localhost:8734/cb',
      client_id: process.argv[3],
      code_verifier: verifier,
    }),
  })
  console.log(await res.json())
}
main()
" "<VERIFIER>" "<CODE>" "<CLIENT_ID>"
```

Expected: `{ access_token: '...', token_type: 'bearer', expires_in: 3600 }`.

- [ ] **Step 3: Use the returned access token on a write tool**

```bash
TOKEN="<paste access_token from previous step>"
curl -s -X POST https://mcp.tugy.dev/mcp -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_recipe","arguments":{"title":"E2E OAuth Test Recipe"}}}'
```

Expected: succeeds, creates a draft recipe owned by the *test user's* Clerk ID (not the site owner's) - verify via `kubectl` against Mongo or via the test user's own "My Recipes" page, then delete this test recipe afterward.

- [ ] **Step 4: Verify the legacy shared-secret path still works unchanged**

```bash
KEY=$(kubectl get secret -n apps recipes-mcp-apikey -o jsonpath='{.data.apiKey}' | base64 -d)
curl -s -X POST https://mcp.tugy.dev/mcp -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_my_recipes","arguments":{}}}'
```

Expected: succeeds, returns the owner's own recipes as before.

---

### Task 12: (Conditional - only if Task 1's spike failed) Self-signed JWT fallback

**Only execute this task if Task 1 recorded "SPIKE RESULT: relay failed."**

**Files:**
- Modify: `mcp/src/index.ts` (the `/oauth_callback` and `/token` handlers from Tasks 7-8)
- Modify: `api/src/auth/clerk-auth.guard.ts`
- Modify: `api/src/auth/clerk-auth.guard.spec.ts`
- Modify: `mcp/package.json` (add `jose` dependency)

**Interfaces:**
- Produces: a second token format `recipes-api`'s `ClerkAuthGuard` accepts - an HS256 JWT with a `userId` claim, signed with a new shared secret (`MCP_JWT_SECRET`) known to both services.

- [ ] **Step 1: Add `jose` to the MCP server**

```bash
cd /Users/tugy/git/recipes/mcp
npm install jose@^5.9.6
```

- [ ] **Step 2: In `/oauth_callback` (Task 7), decode Clerk's `id_token` to get the verified Clerk user ID, then mint our own JWT instead of storing the raw Clerk access token**

Change the token exchange in `/oauth_callback` to request `id_token` too and decode it (Clerk signs `id_token` as a standard OIDC JWT, so this uses `jose`'s `jwtVerify` against Clerk's own JWKS, which is separate from the compatibility question the spike tested for `access_token`):

```typescript
      const tokenBody = await tokenRes.json() as { access_token: string, id_token: string }
      const { createRemoteJWKSet, jwtVerify, SignJWT } = await import('jose')
      const jwks = createRemoteJWKSet(new URL(`${CLERK_FRONTEND_API}/.well-known/jwks.json`))
      const { payload } = await jwtVerify(tokenBody.id_token, jwks)
      const clerkUserId = payload.sub!

      const mcpJwtSecret = new TextEncoder().encode(process.env.MCP_JWT_SECRET!)
      clerkAccessToken = await new SignJWT({ userId: clerkUserId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(mcpJwtSecret)
```

(This replaces the line `clerkAccessToken = tokenBody.access_token` from Task 7 - the variable name stays `clerkAccessToken` for minimal diff even though it's now our own signed JWT, since it flows through the same `AuthCodeRecord.clerkAccessToken` field end to end.)

- [ ] **Step 3: Add the second verification path to `ClerkAuthGuard`**

In `api/src/auth/clerk-auth.guard.ts`, add after the existing `RECIPES_API_KEY` bypass check and before the `verifyToken` call:

```typescript
    const mcpJwtSecret = this.config.get<string>('MCP_JWT_SECRET')
    if (mcpJwtSecret) {
      try {
        const { jwtVerify } = await import('jose')
        const { payload } = await jwtVerify(token, new TextEncoder().encode(mcpJwtSecret))
        if (typeof payload.userId === 'string') {
          request.userId = payload.userId
          return true
        }
      } catch {
        // Not one of our MCP-issued JWTs - fall through to normal Clerk verification below.
      }
    }
```

Add `@nestjs/config`-style import for `jose` at the top only if not already present (dynamic `import()` avoids adding a hard top-level dependency if `jose` isn't already in `api/package.json` - add it: `cd api && npm install jose@^5.9.6`).

- [ ] **Step 4: Write the test**

Add to `api/src/auth/clerk-auth.guard.spec.ts`, following the existing pattern for the `RECIPES_API_KEY` bypass test:

```typescript
  it('accepts an MCP-issued JWT and sets userId from its claim', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-mcp-secret')
    const token = await new SignJWT({ userId: 'user_from_mcp' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret)

    const config = { get: jest.fn((key: string) => (key === 'MCP_JWT_SECRET' ? 'test-mcp-secret' : key === 'CLERK_SECRET_KEY' ? 'sk_test' : undefined)) }
    const guard = new ClerkAuthGuard(reflector, config as any, usersService as any)
    const request: any = { headers: { authorization: `Bearer ${token}` } }
    const context = makeContext(request)

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.userId).toBe('user_from_mcp')
  })
```

(Match this to the exact helper names - `reflector`, `usersService`, `makeContext` - already defined earlier in the existing spec file; read the file first to confirm exact names before inserting.)

- [ ] **Step 5: Run tests**

Run: `cd api && npx jest clerk-auth.guard.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/tugy/git/recipes
git add api/src/auth/clerk-auth.guard.ts api/src/auth/clerk-auth.guard.spec.ts api/package.json api/package-lock.json mcp/src/index.ts mcp/package.json mcp/package-lock.json
git commit -m "feat: add self-signed JWT fallback for MCP OAuth when Clerk access tokens aren't directly verifiable"
```

- [ ] **Step 7: Add `MCP_JWT_SECRET` to both deployments' env in the server repo (same sealed-secret pattern as Task 10), deploy, and re-run Task 11's end-to-end test.**
