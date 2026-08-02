# Public MCP Server: Read Access + Per-User OAuth Write Access

## Context

The MCP server (`mcp/`, deployed at `https://mcp.tugy.dev/mcp`) currently authenticates every request with a single static bearer token (`RECIPES_API_KEY`) that maps to one hardcoded `OWNER_USER_ID`. This works for the owner's own tooling but has two problems for the goal of "let more people add this to their Gemini/ChatGPT":

1. **Read access requires a secret.** Anyone who wants to just browse/search published recipes through their own assistant needs the owner's private key.
2. **There is no concept of "another person."** Every write (create/update/submit a recipe) happens as the owner, regardless of who is actually asking.

This spec covers making the MCP server safe to publish for two use cases:
- **Anyone** can browse/search published recipes with zero credentials.
- **A signed-in user** (an existing recipes.tugy.dev / Clerk account) can manage their own recipes through the assistant, authenticating as themselves.

Out of scope for this spec (tracked separately, in this order):
- Clerk production-instance migration (currently in Clerk "Development mode" — a known prerequisite for the site's own public launch, independent of this work).
- ChatGPT Apps directory submission (manifest, verified domain, privacy policy, ToS, branding, review).
- Gemini extension directory submission (equivalent, platform-specific requirements).

Both directory submissions hard-depend on the OAuth work in this spec being done first.

## Phase 1 — Public read-only tools

**Problem:** `mcp/src/index.ts` currently gates the entire HTTP transport on one check (around line 208-211): if the incoming request's `Authorization` header isn't exactly `Bearer <RECIPES_API_KEY>`, it responds 401 before any tool handler runs. This blocks anonymous read access along with everything else.

**Change:** Split registered tools into two trust tiers.

- **Read tools** — `search_recipes`, `get_recipe`, `list_recipes` (exact existing tool names to be confirmed against current `mcp/src/index.ts` registrations) — do not require the caller to send any `Authorization` header. The top-level bearer gate is removed for these specific tool invocations.
- **Write tools** — `create_recipe`, `update_recipe`, `submit_for_review` (and any other mutating tool) — keep requiring today's shared bearer token unmodified. They stay effectively private/trusted-only until Phase 2 ships. This is a deliberate temporary state, not a regression: no new public write surface opens until real per-user auth exists.

Internally, read tools continue to call `recipes-api` using the MCP server's own server-side `RECIPES_API_KEY` (exactly as today, via `recipesApi.ts`) — the calling AI client/user never sees or needs any credential. Since these tools only ever expose already-public/published recipe data, this is safe.

**Testing:**
- A request to a read tool with no `Authorization` header at all succeeds.
- A request to a write tool with no `Authorization` header still 401s (unchanged behavior).
- A request to a write tool with the existing valid shared bearer still succeeds (unchanged behavior).

## Phase 2 — Per-user OAuth for write tools

**One-time setup (Clerk dashboard):** create a single OAuth Application in Clerk (client_id/secret), with redirect URI `https://mcp.tugy.dev/oauth_callback` and scopes `openid email profile`. This is the only registration ever made directly with Clerk — ChatGPT, Gemini, and any future AI client never talk to Clerk directly.

**Why a proxy is needed:** Clerk supports acting as an OAuth 2.0/OIDC Identity Provider, but does not support Dynamic Client Registration (DCR). MCP-compatible clients (ChatGPT, Gemini) expect to be able to self-register against the authorization server they're pointed at. So the MCP server itself becomes a thin OAuth 2.1 authorization server that implements DCR, and internally proxies the actual login/consent to Clerk using the one static Clerk client registered above.

**New endpoints on the MCP server:**

- `GET /.well-known/oauth-authorization-server` — OAuth AS metadata document describing the MCP server's own `/authorize`, `/token`, `/register` endpoints (per the MCP authorization spec's expectations for how a client discovers these).
- `POST /register` — Dynamic Client Registration. Accepts client metadata from the connecting AI tool (e.g. redirect URIs, client name), mints a random `client_id` (and `client_secret` if the client is confidential), and stores the registration in Redis with a TTL (e.g. 30 days, renewable on use).
- `GET /authorize` — Validates the AI client's `client_id` (looked up in Redis), `redirect_uri`, and PKCE `code_challenge`. Redirects the end user's browser to Clerk's real `/oauth/authorize`, using the one static Clerk `client_id`/redirect URI, carrying enough state to correlate the eventual callback back to this specific AI-client authorization attempt.
- `GET /oauth_callback` — The redirect URI registered with Clerk. Receives Clerk's authorization code, exchanges it at Clerk's token endpoint for Clerk's real `access_token`/`id_token`/`refresh_token`. Mints a short-lived (e.g. 2 minute) opaque authorization code, stores it in Redis mapped to the Clerk tokens just obtained, and redirects the browser back to the *original* AI client's redirect URI with this opaque code (and the original `state` it sent to `/authorize`).
- `POST /token` — The AI client exchanges the opaque code (verifying the PKCE `code_verifier` against the `code_challenge` from `/authorize`) for an access token it can use going forward.

**Token compatibility spike (first implementation task, before building the rest of Phase 2):** confirm whether a Clerk OAuth-IdP `access_token` verifies successfully through the same `verifyToken()` call (`@clerk/backend`) that `recipes-api`'s `ClerkAuthGuard` already uses for normal session tokens.

- **If it verifies successfully:** `/token` simply relays Clerk's real `access_token` (looked up from the Redis-stored mapping) back to the AI client, unmodified. Write-tool calls in the MCP server forward this token straight through as the `Authorization` header when calling `recipes-api`. `ClerkAuthGuard` needs zero changes — it already accepts real Clerk tokens for the website's own users.
- **If it does not verify:** fall back to a self-signed token. The MCP server signs its own JWT (HS256, a new shared secret) containing the verified Clerk `userId` as a claim, obtained by validating Clerk's `id_token` once during the callback. `ClerkAuthGuard` gains a second acceptance path: try Clerk's `verifyToken()` first (existing behavior, unchanged), and if that fails, verify the HS256 shared-secret JWT instead and extract `userId` from its claim. This is the only scenario where `recipes-api` changes at all.

**New infrastructure:** Redis (already deployed at `redis.apps.svc.cluster.local`) stores: DCR client registrations (client_id → redirect_uris, secret hash, TTL ~30 days), and pending authorization-code correlations (opaque code → Clerk tokens, TTL ~2 minutes).

**Error handling:**
- Expired or unknown opaque code at `/token` → standard OAuth `invalid_grant` error response.
- Clerk token exchange failure at `/oauth_callback` → redirect to the AI client's redirect URI with a standard OAuth `error=server_error` parameter (never silently fail).
- Expired Clerk token on a write-tool call → `recipes-api` returns 401 as it already does today; the MCP server passes that 401 straight back to the AI client unchanged, which should trigger the client to re-run the OAuth flow.
- PKCE mismatch at `/token` → `invalid_grant`, same as expired code.

**Testing:**
- A scripted PKCE client (using a library such as `openid-client`, or a manual curl sequence) drives the full flow: `POST /register` → `GET /authorize` → simulated Clerk login (test user) → `POST /token` → a write-tool call using the returned token, asserting the created/updated recipe is owned by the correct Clerk user.
- Expired-code, PKCE-mismatch, and expired-token scenarios each produce the specific error behavior described above.
- Read tools from Phase 1 remain unaffected (no regression).

## Sequencing note

Phase 1 has no dependency on Clerk's production-mode status and can ship immediately. Phase 2 should land after (or alongside a fix for) the Clerk production-instance migration mentioned as a known separate issue — building OAuth against a dev-mode Clerk instance that's about to be migrated risks redoing the work.
