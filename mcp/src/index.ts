import { randomBytes } from 'node:crypto'
import { Redis as RedisClient } from 'ioredis'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { z } from 'zod'
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
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { createOAuthStore } from './oauthStore.js'
import { verifyPkce } from './pkce.js'

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

const ingredientItemSchema = z.object({
  amount: z.number().optional(),
  unit: z.string().optional(),
  name: z.string(),
  nameEn: z.string().optional(),
  note: z.string().optional(),
  noteEn: z.string().optional(),
})

const ingredientGroupSchema = z.object({
  group: z.string().optional(),
  groupEn: z.string().optional(),
  items: z.array(ingredientItemSchema),
})

const stepItemSchema = z.object({
  instruction: z.string(),
  instructionEn: z.string().optional(),
  timerMinutes: z.number().optional(),
  tip: z.string().optional(),
  tipEn: z.string().optional(),
})

const stepGroupSchema = z.object({
  title: z.string().optional(),
  titleEn: z.string().optional(),
  items: z.array(stepItemSchema),
})

const recipeFieldsSchema = {
  title: z.string().min(1).describe('English title of the recipe'),
  titleHe: z.string().optional().describe('Hebrew title'),
  category: z.enum(CATEGORIES).optional(),
  tags: z.array(z.string()).optional().describe('Hebrew tags'),
  tagsEn: z.array(z.string()).optional().describe('English tags'),
  cuisine: z.string().optional(),
  description: z.string().optional().describe('Hebrew description'),
  descriptionEn: z.string().optional().describe('English description'),
  prepTime: z.number().int().min(0).optional().describe('Minutes'),
  cookTime: z.number().int().min(0).optional().describe('Minutes'),
  servings: z.number().int().min(1).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  ingredients: z.array(ingredientGroupSchema).optional(),
  steps: z.array(stepGroupSchema).optional(),
  tips: z.array(z.string()).optional().describe('Hebrew tips'),
  tipsEn: z.array(z.string()).optional().describe('English tips'),
  featured: z.boolean().optional(),
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function errorResult(err: unknown) {
  const message = err instanceof RecipesApiError ? `${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function createServer(bearerToken?: string): McpServer {
  const server = new McpServer({ name: 'recipes-mcp', version: '1.0.0' })

  server.registerTool(
    'list_my_recipes',
    {
      title: 'List my recipes',
      description: "Lists every recipe owned by the authenticated user, including drafts, pending review, published, and rejected ones.",
    },
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
    {
      title: 'Get one of my recipes',
      description: 'Fetches a single recipe you own by its slug, including drafts, pending review, and rejected ones.',
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      try {
        return textResult(JSON.stringify(await getMyRecipe(slug, bearerToken), null, 2))
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

  server.registerTool(
    'create_recipe',
    {
      title: 'Create a recipe draft',
      description: 'Creates a new private draft recipe owned by the authenticated user. Only title is required; fill in as much as you can from the source (e.g. a photo of a recipe).',
      inputSchema: recipeFieldsSchema,
    },
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
    {
      title: 'Update a recipe',
      description: 'Updates an existing recipe owned by the authenticated user. Only provided fields are changed; the recipe must not be pending review.',
      inputSchema: { slug: z.string(), ...Object.fromEntries(Object.entries(recipeFieldsSchema).map(([k, v]) => [k, v.optional()])) },
    },
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
    {
      title: 'Upload a recipe photo',
      description: 'Uploads a photo for a recipe from base64-encoded image data and sets it as the recipe\'s image. A published-quality photo is required before a recipe can be submitted for review.',
      inputSchema: {
        slug: z.string(),
        imageBase64: z.string().describe('Base64-encoded image bytes, no data: URI prefix'),
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      },
    },
    async ({ slug, imageBase64, contentType }) => {
      try {
        const publicUrl = await presignAndUploadPhoto(slug, imageBase64, contentType, bearerToken)
        await updateRecipe(slug, { image: publicUrl }, bearerToken)
        // Echo the photo back as an image content block, not just a URL -
        // clients that render tool results inline (Claude, and increasingly
        // others) show the actual uploaded photo in the chat as confirmation.
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
    {
      title: 'Submit a recipe for review',
      description: 'Submits a complete draft recipe for admin review. All fields must be filled in and a real photo uploaded, or this fails listing what is missing.',
      inputSchema: { slug: z.string() },
    },
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

async function main() {
  const port = process.env.PORT ? Number(process.env.PORT) : undefined

  if (!port) {
    const server = createServer()
    await server.connect(new StdioServerTransport())
    return
  }

  const redis = new RedisClient(process.env.REDIS_URL ?? 'redis://redis.apps.svc.cluster.local:6379')
  const oauthStore = createOAuthStore(redis)

  const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? 'https://mcp.tugy.dev'
  const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API
  const CLERK_OAUTH_CLIENT_ID = process.env.CLERK_OAUTH_CLIENT_ID
  const CLERK_OAUTH_CLIENT_SECRET = process.env.CLERK_OAUTH_CLIENT_SECRET

  const app = express()
  app.use(express.json({ limit: '15mb' }))

  // OAuth clients (ChatGPT, Gemini) may run their token exchange directly
  // from the browser rather than server-to-server. Without CORS headers,
  // the browser silently blocks that fetch before it ever reaches us -
  // the auth code gets minted but never redeemed, and the client just
  // reports a generic connection failure.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  const PUBLIC_TOOLS = new Set(['list_recipes', 'get_recipe'])

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: MCP_PUBLIC_URL,
      authorization_endpoint: `${MCP_PUBLIC_URL}/authorize`,
      token_endpoint: `${MCP_PUBLIC_URL}/token`,
      registration_endpoint: `${MCP_PUBLIC_URL}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      scopes_supported: ['openid', 'email', 'profile'],
    })
  })

  // RFC 9728 Protected Resource Metadata - this is what a spec-compliant
  // MCP client (ChatGPT, Claude, etc.) fetches FIRST to discover which
  // authorization server protects this resource. Without it, clients can't
  // complete the trust chain even if login/consent visually succeeds.
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: `${MCP_PUBLIC_URL}/mcp`,
      authorization_servers: [MCP_PUBLIC_URL],
    })
  })

  app.post('/register', async (req, res) => {
    const redirectUris = req.body?.redirect_uris
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u: unknown) => typeof u === 'string')) {
      res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of strings' })
      return
    }
    const { clientId, clientSecret } = await oauthStore.registerClient({ redirectUris, clientName: req.body?.client_name })
    res.status(201).json({ client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris })
  })

  app.get('/authorize', async (req, res) => {
    if (!CLERK_FRONTEND_API || !CLERK_OAUTH_CLIENT_ID) {
      res.status(503).send('OAuth login is not configured on this server yet')
      return
    }
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

    // Clerk's OAuth access token is an RFC 9068 "at+jwt" token, not the
    // session-token format recipes-api's ClerkAuthGuard verifies via Clerk's
    // verifyToken() - that call rejects it outright. Instead we verify it
    // ourselves against Clerk's own JWKS (proving it's a real, currently
    // valid token for a real user), then mint our own HS256 JWT carrying
    // just the verified userId, which ClerkAuthGuard has a second path to
    // accept.
    let clerkAccessToken: string
    try {
      const tokenRes = await fetch(`${CLERK_FRONTEND_API}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${MCP_PUBLIC_URL}/oauth_callback`,
          client_id: CLERK_OAUTH_CLIENT_ID!,
          client_secret: CLERK_OAUTH_CLIENT_SECRET!,
        }),
      })
      if (!tokenRes.ok) throw new Error(await tokenRes.text())
      const tokenBody = await tokenRes.json() as { access_token: string }

      const jwks = createRemoteJWKSet(new URL(`${CLERK_FRONTEND_API}/.well-known/jwks.json`))
      const { payload } = await jwtVerify(tokenBody.access_token, jwks)
      const clerkUserId = payload.sub!

      const mcpJwtSecret = new TextEncoder().encode(process.env.MCP_JWT_SECRET!)
      clerkAccessToken = await new SignJWT({ userId: clerkUserId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(mcpJwtSecret)
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

  app.post('/mcp', async (req, res) => {
    const apiKey = process.env.RECIPES_API_KEY
    const authHeader = req.headers.authorization
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined
    const isAuthed = !!apiKey && bearerToken === apiKey

    const body = req.body as { method?: string; params?: { name?: string } } | undefined
    const isToolCall = body?.method === 'tools/call'
    const toolName = isToolCall ? body?.params?.name : undefined
    const requiresAuth = isToolCall && !PUBLIC_TOOLS.has(toolName ?? '')

    // Either the legacy shared secret, or an OAuth access token minted by
    // our own /token endpoint, authorizes a private tool call. Both are
    // just checked as "is bearerToken present" here - the legacy secret is
    // forwarded to recipes-api as-is (matching today's behavior exactly),
    // and an OAuth token is forwarded as-is too since recipes-api is the
    // actual source of truth for whether a Clerk token is valid.
    if (requiresAuth && !bearerToken) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${MCP_PUBLIC_URL}/.well-known/oauth-protected-resource"`)
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

  app.listen(port, () => {
    console.log(`recipes-mcp listening on :${port}`)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
