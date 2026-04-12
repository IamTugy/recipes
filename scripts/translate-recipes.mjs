/**
 * Translate Hebrew recipe content to English using Google Translate (unofficial endpoint).
 * Fills in missing: descriptionEn, instructionEn, nameEn, tipEn, tipsEn, groupEn, titleEn
 *
 * Usage: node scripts/translate-recipes.mjs
 * Options:
 *   --only=id1,id2   Only process specific IDs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const FILE = path.join(ROOT, 'src/data/recipes.ts')

const args = process.argv.slice(2)
const onlyIds = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',') ?? null

async function translate(text) {
  if (!text || !text.trim()) return ''
  // Skip already-English text (no Hebrew chars)
  if (!/[\u0590-\u05FF]/.test(text)) return text

  const encoded = encodeURIComponent(text.slice(0, 500))
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=iw&tl=en&dt=t&q=${encoded}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, attempt * 5000))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      // Response is [[["translated","original",null,null,1],...],null,"iw"]
      const translated = d[0].map(seg => seg[0]).join('')
      if (!translated) throw new Error('Empty translation')
      return translated
    } catch (e) {
      if (attempt === 4) throw e
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
  throw new Error('Max retries exceeded')
}

// Rate-limited translate queue
let lastCall = 0
async function translateThrottled(text) {
  const now = Date.now()
  const wait = Math.max(0, 200 - (now - lastCall))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCall = Date.now()
  return translate(text)
}

// Unescape JS single-quoted string content before sending to external APIs
function jsUnescape(s) {
  return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
}

// Escape a plain string for insertion inside a JS single-quoted string literal
function escapeForSQ(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Parse recipe blocks
const src = fs.readFileSync(FILE, 'utf8')
const idRe = /id: '([^']+)'/g
const idPositions = []
let m
while ((m = idRe.exec(src)) !== null) idPositions.push({ id: m[1], pos: m.index })

function getChunk(i) {
  const start = idPositions[i].pos
  const end = idPositions[i + 1]?.pos ?? src.length
  return src.slice(start, end)
}

// ── Patch helpers ──────────────────────────────────────────────────────────────

function patchField(content, heField, enField, heValue, enValue) {
  if (!enValue || content.includes(`${enField}:`)) return content
  // Insert enField right after heField: 'value',
  const escaped = heValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['\"]")
  const re = new RegExp(`(${heField}: ['"](?:[^'"\\\\]|\\\\.)*['"][,]?)`)
  return content.replace(re, `$1\n          ${enField}: '${enValue.replace(/'/g, "\\'")}',`)
}

// Match quoted string content respecting escape sequences.
// Single-quoted: allows " inside. Double-quoted: allows ' inside.
// Returns [fullMatch, openQuote, content, closeQuote] or null.
function matchQuotedStr(src, pos) {
  const q = src[pos]
  if (q !== "'" && q !== '"') return null
  let i = pos + 1
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue }
    if (src[i] === q) return [src.slice(pos, i + 1), q, src.slice(pos + 1, i), q]
    i++
  }
  return null
}

// Extract value of a field like `fieldName: 'value'` from a chunk of source.
function extractField(chunk, fieldName) {
  const prefix = `${fieldName}: `
  let start = chunk.indexOf(prefix)
  while (start !== -1) {
    const qStart = start + prefix.length
    const m = matchQuotedStr(chunk, qStart)
    if (m) return m[2]  // return content
    start = chunk.indexOf(prefix, start + 1)
  }
  return null
}

// Replace the first occurrence of `fieldName: 'value'` with `fieldName: 'value', extraField: 'extraValue'`
function insertAfterField(src, fieldName, fieldValue, extraField, extraValue, indent = '            ') {
  // Find exact occurrence
  const prefix = `${fieldName}: `
  let start = src.indexOf(prefix)
  while (start !== -1) {
    const qStart = start + prefix.length
    const m = matchQuotedStr(src, qStart)
    if (m && m[2] === fieldValue) {
      const fullField = prefix + m[0]
      const replacement = `${fullField},\n${indent}${extraField}: '${escapeForSQ(extraValue)}'`
      return src.slice(0, start) + replacement + src.slice(start + fullField.length)
    }
    start = src.indexOf(prefix, start + 1)
  }
  return src
}

async function translateRecipe(id, chunk) {
  let result = chunk
  let changed = false

  // description → descriptionEn
  if (!chunk.includes('descriptionEn:')) {
    const he = extractField(chunk, 'description')
    if (he && /[\u0590-\u05FF]/.test(he)) {
      const en = await translateThrottled(jsUnescape(he))
      result = insertAfterField(result, 'description', he, 'descriptionEn', en, '          ')
      changed = true
    }
  }

  // Step instructions → instructionEn (back-to-front to preserve positions)
  {
    const instrRe = /\{ instruction: (['"])((?:(?!\1)[^\\]|\\.)*)\1/g
    const instrMatches = [...result.matchAll(instrRe)].reverse()
    for (const match of instrMatches) {
      const matchStart = match.index
      // Find end of the step object
      const closeBrace = result.indexOf('}', matchStart + match[0].length)
      if (closeBrace === -1) continue
      const afterInstruction = result.slice(matchStart + match[0].length, closeBrace)
      if (afterInstruction.includes('instructionEn')) continue
      const he = match[2]
      if (!he || !/[\u0590-\u05FF]/.test(he)) continue
      const en = await translateThrottled(jsUnescape(he))
      const q = match[1]
      const instrFull = `instruction: ${q}${he}${q}`
      const replacement = `${instrFull},\n            instructionEn: '${escapeForSQ(en)}'`
      result = result.slice(0, matchStart + 2) + replacement + result.slice(matchStart + match[0].length)
      changed = true
    }
  }

  // Ingredient names → nameEn (process back-to-front so earlier insertions don't shift later positions)
  {
    const nameRe = /name: (['"])((?:(?!\1)[^\\]|\\.)*)\1/g
    const nameMatches = [...result.matchAll(nameRe)].reverse()
    for (const match of nameMatches) {
      const matchStart = match.index
      const after = result.slice(matchStart + match[0].length, matchStart + match[0].length + 40)
      if (after.includes('nameEn:')) continue
      const he = match[2]
      if (!he || !/[\u0590-\u05FF]/.test(he)) continue
      const en = await translateThrottled(jsUnescape(he))
      result = result.slice(0, matchStart) + match[0] + `, nameEn: '${escapeForSQ(en)}'` + result.slice(matchStart + match[0].length)
      changed = true
    }
  }

  // Tips → tipsEn
  if (!chunk.includes('tipsEn:') && chunk.includes('tips:')) {
    const tipsMatch = chunk.match(/tips: \[([^\]]+)\]/)
    if (tipsMatch) {
      const tipRe = /(['"])((?:(?!\1)[^\\]|\\.)*)\1/g
      const tips = [...tipsMatch[1].matchAll(tipRe)].map(m => m[2]).filter(t => /[\u0590-\u05FF]/.test(t))
      if (tips.length) {
        const translated = await Promise.all(tips.map(t => translateThrottled(jsUnescape(t))))
        const enArr = translated.map(t => `'${escapeForSQ(t)}'`).join(', ')
        result = result.replace(/tips: \[([^\]]+)\]/, `tips: [$1],\n    tipsEn: [${enArr}]`)
        changed = true
      }
    }
  }

  // Main recipe title: if title is Hebrew, translate it → title becomes English, titleHe stays Hebrew
  const titlePrefix = '    title: '
  const titleStart = result.search(/^\s+title: /m)
  if (titleStart !== -1) {
    const qStart = result.indexOf(titlePrefix, titleStart) + titlePrefix.length
    const titleMatch = matchQuotedStr(result, qStart)
    if (titleMatch && /[\u0590-\u05FF]/.test(titleMatch[2])) {
      const heTitle = titleMatch[2]
      const enTitle = await translateThrottled(jsUnescape(heTitle))
      const enTitleEsc = escapeForSQ(enTitle)
      const q = titleMatch[1]
      result = result.slice(0, qStart) + q + enTitleEsc + q + result.slice(qStart + titleMatch[0].length)
      if (!result.includes('titleHe:')) {
        const newQStart = result.indexOf(titlePrefix) + titlePrefix.length
        result = result.slice(0, newQStart) + q + enTitleEsc + q + `,\n    titleHe: '${escapeForSQ(heTitle)}'` + result.slice(newQStart + (q + enTitleEsc + q).length)
      }
      result = result.replace(/,?\s*titleEn: (['"])(?:(?!\1)[^\\]|\\.)*\1,?/g, '')
      changed = true
    }
  }

  // Step group titles → titleEn (back-to-front to preserve positions)
  {
    const groupTitleRe = /\{\s*\n?\s*title: (['"])((?:(?!\1)[^\\]|\\.)*)\1/g
    const titleMatches = [...result.matchAll(groupTitleRe)].reverse()
    for (const match of titleMatches) {
      const he = match[2]
      if (!he || !/[\u0590-\u05FF]/.test(he)) continue
      const after = result.slice(match.index + match[0].length, match.index + match[0].length + 40)
      if (after.includes('titleEn')) continue
      const en = await translateThrottled(jsUnescape(he))
      const matchStart = match.index
      result = result.slice(0, matchStart) + match[0] + `,\n        titleEn: '${escapeForSQ(en)}'` + result.slice(matchStart + match[0].length)
      changed = true
    }
  }

  return { result, changed }
}

// ── ID renaming ───────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function renameId(src, oldId, newId) {
  if (oldId === newId) return src
  // Replace id field
  src = src.replace(`id: '${oldId}'`, `id: '${newId}'`)
  // Replace image path if it references the old id
  src = src.replace(new RegExp(`/images/${oldId}\\.jpg`, 'g'), `/images/${newId}.jpg`)
  return src
}

function renameImageFile(oldId, newId) {
  const dir = path.join(ROOT, 'public/images')
  const oldPath = path.join(dir, `${oldId}.jpg`)
  const newPath = path.join(dir, `${newId}.jpg`)
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

const toProcess = onlyIds
  ? idPositions.filter(r => onlyIds.includes(r.id))
  : idPositions

console.log(`Translating ${toProcess.length} recipes...`)
let success = 0, skipped = 0

let fullSrc = fs.readFileSync(FILE, 'utf8')

for (const item of toProcess) {
  // Re-find position after each patch
  const currentPos = fullSrc.indexOf(`id: '${item.id}'`)
  if (currentPos === -1) { console.log(`[skip] ${item.id} (not found)`); skipped++; continue }

  const nextIdPos = (() => {
    const idx = idPositions.findIndex(p => p.id === item.id)
    const nextId = idPositions[idx + 1]?.id
    return nextId ? fullSrc.indexOf(`id: '${nextId}'`) : fullSrc.length
  })()

  const chunk = fullSrc.slice(currentPos, nextIdPos)

  // Quick check: does this recipe need anything?
  const needsWork = !chunk.includes('descriptionEn:') ||
    (chunk.match(/instruction:/g) || []).length > (chunk.match(/instructionEn:/g) || []).length ||
    [...chunk.matchAll(/name: (['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].some(m => /[\u0590-\u05FF]/.test(m[2]) && !chunk.includes('nameEn:'))

  if (!needsWork) { process.stdout.write('.'); skipped++; continue }

  process.stdout.write(`\n[tr]   ${item.id} ... `)

  try {
    const { result, changed } = await translateRecipe(item.id, chunk)
    let patchedResult = result
    let finalId = item.id

    // Rename ugly auto-generated IDs (e.g. dessert-6cfabe-2) to English slugs
    if (/^[a-z]+-[0-9a-f]{6}(-\d+)?$/.test(item.id)) {
      const title = patchedResult.match(/^\s*title: ['"]([^'"]+)['"]/m)?.[1]
      if (title && /^[A-Za-z]/.test(title)) {
        const slug = slugify(title)
        if (slug && slug !== item.id && !fullSrc.includes(`id: '${slug}'`)) {
          patchedResult = patchedResult.replace(`id: '${item.id}'`, `id: '${slug}'`)
          patchedResult = patchedResult.replace(new RegExp(`/images/${item.id}\\.jpg`, 'g'), `/images/${slug}.jpg`)
          renameImageFile(item.id, slug)
          finalId = slug
          process.stdout.write(` → ${slug}`)
        }
      }
    }

    if (changed || finalId !== item.id) {
      fullSrc = fullSrc.slice(0, currentPos) + patchedResult + fullSrc.slice(nextIdPos)
      fs.writeFileSync(FILE, fullSrc)
      process.stdout.write(' done')
      success++
    } else {
      process.stdout.write('no changes')
      skipped++
    }
  } catch (err) {
    process.stdout.write(`FAILED: ${err.message}`)
  }
}

console.log(`\n\nDone. ${success} translated, ${skipped} skipped.`)
