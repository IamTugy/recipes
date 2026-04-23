/**
 * Generate anime-style watercolor recipe illustrations via Pollinations.ai.
 *
 * Usage:
 *   node scripts/generate-images.mjs                 # process all recipes, skip existing
 *   node scripts/generate-images.mjs --only=id1,id2  # only these recipes
 *   node scripts/generate-images.mjs --limit=5       # cap N to process (batch review)
 *   node scripts/generate-images.mjs --no-skip-existing  # regenerate all
 *   node scripts/generate-images.mjs --dry-run       # print prompts only, don't fetch
 *
 * Images written to public/images/{id}.jpg and the recipe YAML's `image:`
 * field is patched to `/images/{id}.jpg`.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RECIPES_DIR = path.join(ROOT, 'src/data/recipes')
const IMAGES_DIR = path.join(ROOT, 'public/images')
fs.mkdirSync(IMAGES_DIR, { recursive: true })

const args = process.argv.slice(2)
const argVal = k => args.find(a => a.startsWith(`${k}=`))?.split('=')[1]
const onlyIds = argVal('--only')?.split(',') ?? null
const limit = Number(argVal('--limit')) || null
const skipExisting = !args.includes('--no-skip-existing')
const dryRun = args.includes('--dry-run')

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(recipe) {
  const title = recipe.titleEn ?? recipe.title
  const ingredients = (recipe.ingredients ?? [])
    .flatMap(g => g.items ?? [])
    .map(item => item.nameEn ?? item.name ?? '')
    .map(n => n.replace(/\s*\(.*?\)\s*/g, '').trim())
    .filter(n => n && n.length < 50)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 14)
    .join(', ')

  return [
    'Anime-style food illustration, Studio Ghibli inspired, soft watercolor and gouache textures,',
    'chalky muted pastel palette, warm natural lighting, hand-painted look with visible brush strokes,',
    'top-down three-quarter view of the finished dish on a simple ceramic plate or bowl,',
    'against a cream linen or chalky off-white paper background.',
    `Dish: ${title}.`,
    ingredients ? `Show ONLY these ingredients, appetizingly arranged: ${ingredients}.` : '',
    'No text, no labels, no utensils, no hands, no extra garnish that is not listed.',
    'Cozy, detailed but clean, subtle steam if the dish is hot. Square composition,',
    'soft edges, slightly desaturated, dreamy atmosphere. No photorealism.',
  ].filter(Boolean).join(' ')
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function generateImage(prompt, seed) {
  const encoded = encodeURIComponent(prompt)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url)
    if (res.status === 429) {
      const wait = attempt * 10000
      process.stdout.write(` [rate-limited, waiting ${wait / 1000}s]`)
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

// ── YAML patch ────────────────────────────────────────────────────────────────

function patchImageField(filePath, newImage) {
  const src = fs.readFileSync(filePath, 'utf8')
  if (/^image:\s*.*$/m.test(src)) {
    const patched = src.replace(/^image:\s*.*$/m, `image: ${newImage}`)
    fs.writeFileSync(filePath, patched)
  } else {
    // insert after id line
    const patched = src.replace(/^(id:\s*.*)$/m, `$1\nimage: ${newImage}`)
    fs.writeFileSync(filePath, patched)
  }
}

// ── Load recipes ──────────────────────────────────────────────────────────────

const files = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.yaml'))
const recipes = files.map(f => {
  const filePath = path.join(RECIPES_DIR, f)
  const data = yaml.load(fs.readFileSync(filePath, 'utf8'))
  return { ...data, __file: filePath }
})

let toProcess = onlyIds ? recipes.filter(r => onlyIds.includes(r.id)) : recipes
if (limit) toProcess = toProcess.slice(0, limit)

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Processing ${toProcess.length} / ${recipes.length} recipes${dryRun ? ' (dry run)' : ''}`)
let success = 0, skipped = 0, failed = 0

for (const recipe of toProcess) {
  const outPath = path.join(IMAGES_DIR, `${recipe.id}.jpg`)
  const relPath = `/images/${recipe.id}.jpg`

  if (skipExisting && fs.existsSync(outPath)) {
    console.log(`[skip] ${recipe.id}`)
    skipped++
    continue
  }

  const prompt = buildPrompt(recipe)

  if (dryRun) {
    console.log(`\n[${recipe.id}]\n${prompt}\n`)
    success++
    continue
  }

  process.stdout.write(`[gen]  ${recipe.id} ... `)
  try {
    const seed = Math.floor(Math.random() * 99999)
    const imageData = await generateImage(prompt, seed)
    fs.writeFileSync(outPath, imageData)
    patchImageField(recipe.__file, relPath)
    console.log('done')
    success++
  } catch (err) {
    console.log(`FAILED: ${err.message}`)
    failed++
  }

  await new Promise(r => setTimeout(r, 1500))
}

console.log(`\nDone. ${success} generated, ${skipped} skipped, ${failed} failed.`)
