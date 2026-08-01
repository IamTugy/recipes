import { NotesController } from './notes.controller'

describe('NotesController', () => {
  const notesService = { get: jest.fn(), save: jest.fn(), remove: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('GET /notes/:slug returns the note text', async () => {
    notesService.get.mockResolvedValue('used less sugar')
    const controller = new NotesController(notesService as any)
    await expect(controller.get('a', { userId: 'user_1' } as any)).resolves.toEqual({ text: 'used less sugar' })
    expect(notesService.get).toHaveBeenCalledWith('user_1', 'a')
  })

  it('PUT /notes/:slug saves the note text', async () => {
    const controller = new NotesController(notesService as any)
    const result = await controller.save('a', { text: 'great!' }, { userId: 'user_1' } as any)
    expect(notesService.save).toHaveBeenCalledWith('user_1', 'a', 'great!')
    expect(result).toEqual({ text: 'great!' })
  })

  it('DELETE /notes/:slug removes the note', async () => {
    const controller = new NotesController(notesService as any)
    const result = await controller.remove('a', { userId: 'user_1' } as any)
    expect(notesService.remove).toHaveBeenCalledWith('user_1', 'a')
    expect(result).toEqual({ text: null })
  })
})
