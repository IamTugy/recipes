import { UsersController } from './users.controller'
import { UsersService } from './users.service'

describe('UsersController', () => {
  const usersService = { getPreferences: jest.fn(), setPreferences: jest.fn(), search: jest.fn() }
  const controller = new UsersController(usersService as unknown as UsersService)

  beforeEach(() => jest.clearAllMocks())

  it('GET /users/search delegates to the service, excluding the current user', async () => {
    usersService.search.mockResolvedValue([{ userId: 'user_2', name: 'Bob' }])
    const result = await controller.search('bob', { userId: 'user_1' } as any)
    expect(usersService.search).toHaveBeenCalledWith('bob', 'user_1')
    expect(result).toEqual([{ userId: 'user_2', name: 'Bob' }])
  })

  it('GET /users/search treats a missing query param as an empty string', async () => {
    usersService.search.mockResolvedValue([])
    await controller.search(undefined, { userId: 'user_1' } as any)
    expect(usersService.search).toHaveBeenCalledWith('', 'user_1')
  })

  it('GET /users/me/preferences returns the current user preferences', async () => {
    usersService.getPreferences.mockResolvedValue({ lang: 'he', theme: 'dark' })
    const result = await controller.getPreferences({ userId: 'user_1' } as any)
    expect(usersService.getPreferences).toHaveBeenCalledWith('user_1')
    expect(result).toEqual({ lang: 'he', theme: 'dark' })
  })

  it('PATCH /users/me/preferences updates and returns the preferences', async () => {
    usersService.setPreferences.mockResolvedValue({ lang: 'en', theme: 'dark' })
    const result = await controller.updatePreferences({ lang: 'en' }, { userId: 'user_1' } as any)
    expect(usersService.setPreferences).toHaveBeenCalledWith('user_1', { lang: 'en' })
    expect(result).toEqual({ lang: 'en', theme: 'dark' })
  })
})
