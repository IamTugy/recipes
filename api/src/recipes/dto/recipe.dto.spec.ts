import 'reflect-metadata'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { IngredientItemDto } from './recipe.dto'

describe('IngredientItemDto', () => {
  it('is valid with a name and no link', async () => {
    const dto = plainToInstance(IngredientItemDto, { name: 'Flour', amount: 200, unit: 'g' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('is valid with a linkedRecipeId and no name', async () => {
    const dto = plainToInstance(IngredientItemDto, { linkedRecipeId: 'recipe-1', amount: 800, unit: 'g' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('is invalid with neither a name nor a linkedRecipeId', async () => {
    const dto = plainToInstance(IngredientItemDto, { amount: 1, unit: 'pcs' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'name')).toBe(true)
  })
})
