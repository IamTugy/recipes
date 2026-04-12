/**
 * Upload all local recipe images to Cloudflare R2 and update recipes.ts paths.
 * Uses CF API token (no S3 credentials needed).
 *
 * Usage: node scripts/upload-to-r2.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const IMAGES_DIR = path.join(ROOT, 'public/images')
const RECIPES_FILE = path.join(ROOT, 'src/data/recipes.ts')

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const TOKEN = process.env.CF_TOKEN
const BUCKET = 'recipes-assets'
const PUBLIC_URL = 'https://assets.tugy.dev'

if (!ACCOUNT_ID || !TOKEN) {
  console.error('CF_ACCOUNT_ID and CF_TOKEN must be set')
  process.exit(1)
}

async function uploadFile(filename, data) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${filename}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'image/jpeg',
    },
    body: data,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
}

const images = fs.readdirSync(IMAGES_DIR).filter(f => f.endsWith('.jpg'))
console.log(`Uploading ${images.length} images to R2...`)

let uploaded = 0, failed = 0
for (const filename of images) {
  process.stdout.write(`  ${filename} ... `)
  try {
    const data = fs.readFileSync(path.join(IMAGES_DIR, filename))
    await uploadFile(filename, data)
    process.stdout.write('ok\n')
    uploaded++
  } catch (e) {
    process.stdout.write(`FAILED: ${e.message}\n`)
    failed++
  }
}

console.log(`\nUploaded ${uploaded}, failed ${failed}`)

// Update recipes.ts: replace /images/filename.jpg → https://assets.tugy.dev/filename.jpg
console.log('\nUpdating recipes.ts image paths...')
let src = fs.readFileSync(RECIPES_FILE, 'utf8')
const before = src
src = src.replace(/\/images\/([^'"]+\.jpg)/g, `${PUBLIC_URL}/$1`)
if (src !== before) {
  fs.writeFileSync(RECIPES_FILE, src)
  const count = (before.match(/\/images\/[^'"]+\.jpg/g) || []).length
  console.log(`Updated ${count} image paths to ${PUBLIC_URL}`)
} else {
  console.log('No local image paths found to update.')
}
