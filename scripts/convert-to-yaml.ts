import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { recipes } from '../src/data/recipes'

const __dirname = dirname(fileURLToPath(import.meta.url))

const outDir = join(__dirname, '../src/data/recipes')
mkdirSync(outDir, { recursive: true })

let count = 0
for (const recipe of recipes) {
  const filename = `${recipe.id}.yaml`
  const content = yaml.dump(recipe, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    noRefs: true,
  })
  writeFileSync(join(outDir, filename), content, 'utf-8')
  count++
}

console.log(`Done! Written ${count} YAML files to src/data/recipes/`)
