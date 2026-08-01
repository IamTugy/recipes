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

Set `PORT` and the server switches to HTTP mode, exposing a single endpoint
at `POST /mcp` (Streamable HTTP transport, stateless). Requests must carry
`Authorization: Bearer <RECIPES_API_KEY>`.

```bash
PORT=3000 RECIPES_API_KEY=... RECIPES_API_BASE_URL=https://recipes.tugy.dev/api npm start
```

A `Dockerfile` is included for containerized deployment. This is **not yet
wired into the cluster's CI/CD** - deploying it for real (a subdomain like
`mcp.tugy.dev`, a Cloudflare DNS record, an ingress, and a sealed secret for
`RECIPES_API_KEY`) needs a DNS change and secret provisioning that's safer
done deliberately rather than unattended. Do that manually when you're ready:

1. Generate a random `RECIPES_API_KEY` and add it to the `recipes-api`
   deployment's env (sealed secret, same pattern as its other secrets).
2. Build and push the image (`docker build -t <registry>/recipes-mcp:<tag> mcp/`).
3. Add a Cloudflare DNS record for `mcp.tugy.dev` pointing at the tunnel,
   same as the other subdomains.
4. Add a `k8s/apps/recipes-mcp/` deployment + service + ingress in the
   `server` repo, mirroring `k8s/apps/recipes-api/`, with `PORT=3000` and the
   same `RECIPES_API_KEY` secret mounted.
5. Point the ChatGPT/Gemini connector config at `https://mcp.tugy.dev/mcp`
   with the API key as its bearer token.
