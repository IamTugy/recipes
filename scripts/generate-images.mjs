/**
 * Generate recipe images using Gemini image generation API.
 * Usage: GEMINI_API_KEY=your_key node scripts/generate-images.mjs
 *
 * Options:
 *   --only=id1,id2   Only regenerate specific recipe IDs
 *   --skip-existing  Skip recipes that already have a local image (default: true)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// No API key needed - uses Pollinations.ai (free, no auth)

const IMAGES_DIR = path.join(ROOT, 'public', 'images')
fs.mkdirSync(IMAGES_DIR, { recursive: true })

const args = process.argv.slice(2)
const onlyIds = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',') ?? null
const skipExisting = !args.includes('--no-skip-existing')

// ── Parse recipes.ts ──────────────────────────────────────────────────────────

const src = fs.readFileSync(path.join(ROOT, 'src/data/recipes.ts'), 'utf8')

const idRe = /id: '([^']+)'/g
const idPositions = []
let m
while ((m = idRe.exec(src)) !== null) {
  idPositions.push({ id: m[1], pos: m.index })
}

function extractChunk(i) {
  const start = idPositions[i].pos
  const end = idPositions[i + 1] ? idPositions[i + 1].pos : src.length
  return src.slice(start, end)
}

const recipes = idPositions.map((item, i) => {
  const chunk = extractChunk(i)
  const title = chunk.match(/^\s*title: ['"]([^'"]+)['"]/m)?.[1] ?? item.id
  const descEn = chunk.match(/descriptionEn: ['"]([^'"]+)['"]/)?.[1]
  const desc = chunk.match(/^\s+description: ['"]([^'"]+)['"]/m)?.[1] ?? ''
  const cuisine = chunk.match(/cuisine: ['"]([^'"]+)['"]/)?.[1] ?? ''
  const category = chunk.match(/category: ['"]([^'"]+)['"]/)?.[1] ?? ''

  // Extract all English ingredient names for a richer prompt
  const ingredientNames = [...chunk.matchAll(/nameEn: ['"]([^'"]+)['"]/g)]
    .map(m => m[1])
    .filter(n => n.length < 40) // skip long notes
    .slice(0, 12)
    .join(', ')

  return { id: item.id, title, description: descEn ?? desc, cuisine, category, ingredients: ingredientNames }
})

// ── Image generation ──────────────────────────────────────────────────────────

function buildPrompt({ title, description, cuisine, category, ingredients }) {
  const ingredientLine = ingredients ? `Key ingredients: ${ingredients}.` : ''
  const cuisineLine = cuisine ? `Cuisine: ${cuisine}.` : ''
  return `A high-end, professional culinary photograph of ${title} for a fine-dining website. ${description} ${ingredientLine} ${cuisineLine} The full dish is elegantly plated and shown in its entirety with breathing room around it. Camera angle: eye-level to slightly elevated (30-40 degrees), like sitting at a restaurant table looking at the dish - NOT overhead. Soft, warm natural side-lighting casting gentle shadows. Clean white or light linen surface. Minimalist styling with a small relevant garnish only. No utensils, no cutlery, no hands in the frame. Shallow depth of field, soft bokeh background. 8K resolution, photorealistic. Only use ingredients that are actually in this dish.`
}

async function generateImage(recipe) {
  const prompt = buildPrompt(recipe)
  const encoded = encodeURIComponent(prompt)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1200&height=800&model=flux&nologo=true&seed=${Math.floor(Math.random() * 99999)}`

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url)
    if (res.status === 429) {
      const wait = attempt * 10000
      process.stdout.write(` [rate-limited, waiting ${wait/1000}s]`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength < 5000) throw new Error(`Response too small (${buf.byteLength} bytes)`)
    return Buffer.from(buf)
  }
  throw new Error('Max retries exceeded')
}

// ── Update recipes.ts image paths ─────────────────────────────────────────────

function updateRecipesTs(id, imagePath) {
  const rel = imagePath.replace(path.join(ROOT, 'public'), '')
  let updated = fs.readFileSync(path.join(ROOT, 'src/data/recipes.ts'), 'utf8')

  // Replace the image line for this specific recipe block
  const idIndex = updated.indexOf(`id: '${id}'`)
  if (idIndex === -1) return

  const nextId = updated.indexOf("id: '", idIndex + 1)
  const chunk = updated.slice(idIndex, nextId === -1 ? undefined : nextId)

  const newChunk = chunk.replace(
    /image: ['"][^'"]*['"]/,
    `image: '${rel}'`
  )

  if (chunk === newChunk) {
    console.log(`  No image field found to update for ${id}`)
    return
  }

  updated = updated.slice(0, idIndex) + newChunk + (nextId === -1 ? '' : updated.slice(nextId))
  fs.writeFileSync(path.join(ROOT, 'src/data/recipes.ts'), updated)
}

// ── Main loop ─────────────────────────────────────────────────────────────────

const toProcess = onlyIds
  ? recipes.filter(r => onlyIds.includes(r.id))
  : recipes

console.log(`Processing ${toProcess.length} recipes...`)
let success = 0, skipped = 0, failed = 0

for (const recipe of toProcess) {
  const outPath = path.join(IMAGES_DIR, `${recipe.id}.jpg`)

  if (skipExisting && fs.existsSync(outPath)) {
    console.log(`[skip] ${recipe.id}`)
    skipped++
    continue
  }

  process.stdout.write(`[gen]  ${recipe.id} ... `)

  try {
    const imageData = await generateImage(recipe)
    fs.writeFileSync(outPath, imageData)
    updateRecipesTs(recipe.id, outPath)
    console.log('done')
    success++
  } catch (err) {
    console.log(`FAILED: ${err.message}`)
    failed++
  }

  // Small delay to be polite to the free service
  await new Promise(r => setTimeout(r, 1500))
}

console.log(`\nDone. ${success} generated, ${skipped} skipped, ${failed} failed.`)
if (success > 0) {
  console.log('Run "npm run build" to bundle the new images.')
}
