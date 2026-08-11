import { UsersController } from './users.controller'
import { UsersService } from './users.service'

describe('UsersController', () => {
  const usersService = { getPreferences: jest.fn(), setPreferences: jest.fn() }
  const controller = new UsersController(usersService as unknown as UsersService)

  beforeEach(() => jest.clearAllMocks())

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
