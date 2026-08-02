# recipes-mcp

An MCP server that lets an LLM (Claude, Gemini, ChatGPT, ...) create and publish
recipes on `recipes.tugy.dev` on your behalf - e.g. "here's a photo of a recipe
card, fill out the form and upload it."

It's a thin wrapper around the existing recipes REST API, authenticated as the
site owner with a single personal API key (`RECIPES_API_KEY`). That key must
also be set as the `RECIPES_API_KEY` env var on the `recipes-api` deployment -
requests bearing it bypass Clerk and are treated as `OWNER_USER_ID`. Anyone
without the key gets nothing; there's no per-tool-caller identity beyond "has
the key or doesn't."

## Tools

- `list_my_recipes` - every recipe you own, any status
- `get_recipe` - fetch one by slug
- `create_recipe` - create a private draft (only `title` is required)
- `update_recipe` - edit any field on a recipe you own
- `upload_recipe_photo` - upload base64 image bytes and set it as the recipe's photo
- `submit_recipe_for_review` - send a complete draft into the admin review queue

## Running locally (stdio) - for Claude Desktop / Claude Code

No hosting needed. Build once, then point your MCP client's config at the
built file:

```bash
npm install
npm run build
```

Claude Desktop / Claude Code config (`claude_desktop_config.json` or
equivalent):

```json
{
  "mcpServers": {
    "recipes": {
      "command": "node",
      "args": ["/absolute/path/to/recipes/mcp/dist/index.js"],
      "env": {
        "RECIPES_API_KEY": "<the same key configured on recipes-api>",
        "RECIPES_API_BASE_URL": "https://recipes.tugy.dev/api"
      }
    }
  }
}
```

## Running remotely (HTTP) - for connectors that need a URL (e.g. ChatGPT, Gemini)

Deployed and live at **`https://mcp.tugy.dev/mcp`** (Streamable HTTP
transport, stateless). Requests must carry `Authorization: Bearer
<RECIPES_API_KEY>` - the key is the same one issued to the `recipes-api`
deployment, sealed as the `recipes-mcp-apikey` secret in the `apps`
namespace (`server` repo, `k8s/apps/recipes-mcp/`). Inside the cluster it
talks to `recipes-api` directly over the internal service DNS
(`http://recipes-api.apps.svc.cluster.local:80`), not the public API - no
`/api` prefix needed there since that's an nginx rewrite specific to the
public route.

The pipeline builds and pushes the image automatically on every push to
`main` (added to the matrix in `.github/workflows/deploy.yaml`), same as
`recipes` and `recipes-api`; the server repo's `deploy-recipes.yaml` bumps
the deployment's image tag and applies the manifests. No DNS record was
needed - `*.tugy.dev` already wildcards to the Cloudflare Tunnel, and the
tunnel's ingress config forwards every hostname to the same Traefik
instance, which is what actually does the per-subdomain routing.

To point a Gemini/ChatGPT connector at it: give it the URL above and the
API key as a bearer token. (Exact steps for adding a custom remote MCP
connector vary by client and change often - check that client's current
docs rather than trusting anything written here to stay accurate.)

## Generated UI in chat - notes for later

MCP tool results aren't limited to plain text. Content blocks can also be
`image` (base64 + mimeType) - `upload_recipe_photo` already returns one, so
a client that renders tool results inline shows the actual uploaded photo
back in the chat, not just a URL. Worth knowing about when brainstorming
richer integrations:

- **Structured/`outputSchema` results**: `registerTool` supports an
  `outputSchema` alongside `inputSchema` - a tool can return
  `structuredContent` (e.g. the full parsed recipe) that a UI-aware client
  could render as a formatted card instead of raw JSON/text.
- **Resources**: MCP servers can expose `resources` (e.g.
  `recipe://<slug>`) that a client can fetch and render distinctly from
  tool-call text - could back a "preview this recipe" experience.
- **Multiple content blocks per result**: a single tool call can return
  text + image + (in principle) other blocks together, which is how
  today's photo-upload confirmation works.

None of this is implemented beyond the image block on photo upload - it's
here so the next round of "what should we add" starts from what the
protocol actually supports, rather than guessing.
