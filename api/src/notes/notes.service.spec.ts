import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { NotesService } from './notes.service'
import { Note } from './schemas/note.schema'

describe('NotesService', () => {
  const findOne = jest.fn()
  const findOneAndUpdate = jest.fn()
  const deleteOne = jest.fn()
  const model = { findOne, findOneAndUpdate, deleteOne }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [NotesService, { provide: getModelToken(Note.name), useValue: model }],
    }).compile()
    return moduleRef.get(NotesService)
  }

  it('get returns the note text for a user+recipe, or null when none exists', async () => {
    findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ text: 'used less sugar' }) })
    const service = await makeService()
    await expect(service.get('user_1', 'a')).resolves.toBe('used less sugar')
    expect(findOne).toHaveBeenCalledWith({ userId: 'user_1', recipeId: 'a' })
  })

  it('get returns null when no note exists', async () => {
    findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) })
    const service = await makeService()
    await expect(service.get('user_1', 'a')).resolves.toBeNull()
  })

  it('save upserts the note text by userId+recipeId', async () => {
    findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ text: 'great!' }) })
    const service = await makeService()
    await service.save('user_1', 'a', 'great!')
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', recipeId: 'a' },
      { userId: 'user_1', recipeId: 'a', text: 'great!' },
      { upsert: true },
    )
  })

  it('remove deletes the note by userId+recipeId', async () => {
    deleteOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
    const service = await makeService()
    await service.remove('user_1', 'a')
    expect(deleteOne).toHaveBeenCalledWith({ userId: 'user_1', recipeId: 'a' })
  })
})
