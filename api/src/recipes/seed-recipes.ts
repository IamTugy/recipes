import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import mongoose from 'mongoose'
import { Recipe, RecipeSchema } from './schemas/recipe.schema'

export function parseRecipeFiles(dir: string): Record<string, unknown>[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const parsed = yaml.load(raw) as Record<string, unknown>
      return { ...parsed, slug: parsed.id }
    })
}

export async function seedRecipes(mongoUri: string, dataDir: string): Promise<number> {
  await mongoose.connect(mongoUri)
  const RecipeModel = mongoose.model(Recipe.name, RecipeSchema)
  const recipes = parseRecipeFiles(dataDir)

  for (const recipe of recipes) {
    await RecipeModel.findOneAndUpdate({ slug: recipe.slug }, recipe, { upsert: true })
  }

  await mongoose.disconnect()
  return recipes.length
}

if (require.main === module) {
  const mongoUri = process.env.MONGO_URI
  const dataDir = process.env.RECIPE_DATA_DIR
  if (!mongoUri || !dataDir) {
    console.error('MONGO_URI and RECIPE_DATA_DIR must be set')
    process.exit(1)
  }
  seedRecipes(mongoUri, dataDir)
    .then((count) => {
      console.log(`Seeded ${count} recipes`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Seed failed (non-fatal, API will serve existing data):', err)
      process.exit(0)
    })
}
