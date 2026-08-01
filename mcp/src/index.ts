import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { z } from 'zod'
import {
  createRecipe,
  getRecipe,
  listMyRecipes,
  presignAndUploadPhoto,
  RecipesApiError,
  submitForReview,
  updateRecipe,
} from './recipesApi.js'

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

function createServer(): McpServer {
  const server = new McpServer({ name: 'recipes-mcp', version: '1.0.0' })

  server.registerTool(
    'list_my_recipes',
    {
      title: 'List my recipes',
      description: "Lists every recipe owned by the authenticated user, including drafts, pending review, published, and rejected ones.",
    },
    async () => {
      try {
        return textResult(JSON.stringify(await listMyRecipes(), null, 2))
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    'get_recipe',
    {
      title: 'Get a recipe',
      description: 'Fetches a single recipe by its slug.',
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      try {
        return textResult(JSON.stringify(await getRecipe(slug), null, 2))
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
        const recipe = await createRecipe(fields)
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
        await updateRecipe(slug, fields)
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
        const publicUrl = await presignAndUploadPhoto(slug, imageBase64, contentType)
        await updateRecipe(slug, { image: publicUrl })
        return textResult(`Uploaded photo and set it on recipe "${slug}": ${publicUrl}`)
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
        await submitForReview(slug)
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

  const app = express()
  app.use(express.json({ limit: '15mb' }))

  app.post('/mcp', async (req, res) => {
    const apiKey = process.env.RECIPES_API_KEY
    const authHeader = req.headers.authorization
    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
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

  app.listen(port, () => {
    console.log(`recipes-mcp listening on :${port}`)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
