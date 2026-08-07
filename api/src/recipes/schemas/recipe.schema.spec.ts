import { model, Types } from 'mongoose'
import { Recipe, RecipeSchema } from './recipe.schema'

describe('Recipe schema', () => {
  it('includes the id virtual in .toObject() output - every API response depends on this', () => {
    const RecipeModel = model(`Recipe_${Date.now()}`, RecipeSchema)
    const _id = new Types.ObjectId()
    const doc = new RecipeModel({ _id, slug: 'test-recipe', title: 'Test' })

    expect((doc.toObject() as unknown as { id: string }).id).toBe(_id.toHexString())
  })

  it('includes the id virtual in .toJSON() output too, since that is what Express actually sends', () => {
    const RecipeModel = model(`Recipe_${Date.now()}`, RecipeSchema)
    const _id = new Types.ObjectId()
    const doc = new RecipeModel({ _id, slug: 'test-recipe', title: 'Test' })

    expect(JSON.parse(JSON.stringify(doc)).id).toBe(_id.toHexString())
  })
})
