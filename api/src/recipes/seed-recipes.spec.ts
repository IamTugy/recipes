import * as fs from 'fs'
import * as path from 'path'
import { parseRecipeFiles } from './seed-recipes'

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
