import * as fs from 'fs'
import * as path from 'path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { parseRecipeFiles, seedRecipes } from './seed-recipes'

describe('parseRecipeFiles', () => {
  const tmpDir = path.join(__dirname, '__fixtures__')

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'test-recipe.yaml'),
      [
        'id: test-recipe',
        'title: Test Recipe',
        'category: dessert',
        'image: https://assets.tugy.dev/test.jpg',
        'description: A test',
        'prepTime: 5',
        'cookTime: 10',
        'servings: 2',
        'difficulty: easy',
        'tags: []',
        'ingredients: []',
        'steps: []',
      ].join('\n'),
    )
  })

  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('parses every yaml file in the directory into a recipe with slug = id', () => {
    const recipes = parseRecipeFiles(tmpDir)
    expect(recipes).toHaveLength(1)
    expect(recipes[0]).toMatchObject({ slug: 'test-recipe', title: 'Test Recipe' })
  })
})

describe('seedRecipes idempotency', () => {
  const tmpDir = path.join(__dirname, '__fixtures_seed__')
  let mongod: MongoMemoryServer
  let mongoUri: string

  const recipeYaml = (id: string, title: string) =>
    [
      `id: ${id}`,
      `title: ${title}`,
      'category: dessert',
      'image: https://assets.tugy.dev/test.jpg',
      'description: A test',
      'prepTime: 5',
      'cookTime: 10',
      'servings: 2',
      'difficulty: easy',
      'tags: []',
      'ingredients: []',
      'steps: []',
    ].join('\n')

  beforeAll(async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'one.yaml'), recipeYaml('seed-one', 'Seed One'))
    fs.writeFileSync(path.join(tmpDir, 'two.yaml'), recipeYaml('seed-two', 'Seed Two'))
    mongod = await MongoMemoryServer.create()
    mongoUri = mongod.getUri()
  }, 60000)

  afterAll(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    await mongoose.disconnect()
    await mongod.stop()
  })

  async function countRecipes(): Promise<number> {
    await mongoose.connect(mongoUri)
    const count = await mongoose.connection.collection('recipes').countDocuments()
    await mongoose.disconnect()
    return count
  }

  it('running the seed twice upserts rather than duplicating', async () => {
    expect(await seedRecipes(mongoUri, tmpDir)).toBe(2)
    expect(await countRecipes()).toBe(2)

    expect(await seedRecipes(mongoUri, tmpDir)).toBe(2)
    expect(await countRecipes()).toBe(2)

    await mongoose.connect(mongoUri)
    const slugs = (await mongoose.connection.collection('recipes').find({}).toArray())
      .map((doc) => doc.slug)
      .sort()
    await mongoose.disconnect()
    expect(slugs).toEqual(['seed-one', 'seed-two'])
  }, 60000)

  it('does not overwrite a live edit made after the initial seed', async () => {
    await seedRecipes(mongoUri, tmpDir)

    await mongoose.connect(mongoUri)
    await mongoose.connection.collection('recipes').updateOne(
      { slug: 'seed-one' },
      { $set: { image: 'https://recipes-assets.tugy.dev/recipes/seed-one/uploaded.jpg', title: 'User Edited Title' } },
    )
    await mongoose.disconnect()

    await seedRecipes(mongoUri, tmpDir)

    await mongoose.connect(mongoUri)
    const doc = await mongoose.connection.collection('recipes').findOne({ slug: 'seed-one' })
    await mongoose.disconnect()
    expect(doc?.image).toBe('https://recipes-assets.tugy.dev/recipes/seed-one/uploaded.jpg')
    expect(doc?.title).toBe('User Edited Title')
  }, 60000)
})
