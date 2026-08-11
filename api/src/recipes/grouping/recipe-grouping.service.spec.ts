import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipeGroupingService } from './recipe-grouping.service'
import { DishGroup } from '../schemas/dish-group.schema'
import { GeminiService } from '../../ai/gemini.service'

describe('RecipeGroupingService', () => {
  const generateStructured = jest.fn()
  const gemini = { generateStructured }

  function makeExistingGroups(groups: { id: string; name: string; nameHe?: string }[]) {
    return groups.map(g => ({ _id: { toString: () => g.id }, name: g.name, nameHe: g.nameHe }))
  }

  async function makeService(existingGroups: { id: string; name: string; nameHe?: string }[] = []) {
    const docs = makeExistingGroups(existingGroups)
    const exec = jest.fn().mockResolvedValue(docs)
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ select })
    const create = jest.fn().mockImplementation(async (doc: { name: string; nameHe?: string }) => ({
      _id: { toString: () => 'new-group-id' },
      name: doc.name,
      nameHe: doc.nameHe,
    }))
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecipeGroupingService,
        { provide: getModelToken(DishGroup.name), useValue: { find, create } },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile()
    return { service: moduleRef.get(RecipeGroupingService), find, create }
  }

  beforeEach(() => jest.clearAllMocks())

  const recipe = { title: 'Grandma\'s Caprese', titleHe: undefined, ingredients: [{ items: [{ name: 'Tomato' }] }] }

  it('returns the matched existing group when Gemini returns a real existingGroupId', async () => {
    generateStructured.mockResolvedValue({ existingGroupId: 'group-1' })
    const { service } = await makeService([{ id: 'group-1', name: 'Caprese Salad', nameHe: 'סלט קפרזה' }])

    const result = await service.assignGroup(recipe)

    expect(result).toEqual({ id: 'group-1', name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
  })

  it('creates a new group when Gemini proposes a new name', async () => {
    generateStructured.mockResolvedValue({ name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
    const { service, create } = await makeService([])

    const result = await service.assignGroup(recipe)

    expect(create).toHaveBeenCalledWith({ name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
    expect(result).toEqual({ id: 'new-group-id', name: 'Caprese Salad', nameHe: 'סלט קפרזה' })
  })

  it('falls back to creating a new group when existingGroupId does not match any fetched group', async () => {
    generateStructured.mockResolvedValue({ existingGroupId: 'hallucinated-id', name: 'Caprese Salad' })
    const { service, create } = await makeService([{ id: 'group-1', name: 'Chocolate Chip Cookies' }])

    const result = await service.assignGroup(recipe)

    expect(create).toHaveBeenCalledWith({ name: 'Caprese Salad', nameHe: undefined })
    expect(result.id).toBe('new-group-id')
  })

  it('falls back to the recipe title when Gemini proposes no name and no valid existingGroupId', async () => {
    generateStructured.mockResolvedValue({})
    const { service, create } = await makeService([])

    const result = await service.assignGroup(recipe)

    expect(create).toHaveBeenCalledWith({ name: 'Grandma\'s Caprese', nameHe: undefined })
    expect(result.name).toBe('Grandma\'s Caprese')
  })

  it('sends the existing group list and the recipe to Gemini at temperature 0', async () => {
    generateStructured.mockResolvedValue({ name: 'Caprese Salad' })
    const { service } = await makeService([{ id: 'group-1', name: 'Chocolate Chip Cookies' }])

    await service.assignGroup(recipe)

    expect(generateStructured).toHaveBeenCalledTimes(1)
    const [prompt, temperature] = generateStructured.mock.calls[0]
    expect(temperature).toBe(0)
    expect(prompt).toContain('Caprese')
    expect(prompt).toContain('Chocolate Chip Cookies')
    expect(prompt).toContain('group-1')
  })
})
