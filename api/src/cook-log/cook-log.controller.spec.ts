import { CookLogController } from './cook-log.controller'

describe('CookLogController', () => {
  const cookLogService = { markCooked: jest.fn(), unmarkCooked: jest.fn(), listSlugs: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it("GET /cooked returns the current user's cooked recipe slugs", async () => {
    cookLogService.listSlugs.mockResolvedValue(['a', 'b'])
    const controller = new CookLogController(cookLogService as any)
    await expect(controller.list({ userId: 'user_1' } as any)).resolves.toEqual(['a', 'b'])
  })

  it('POST /cooked/:slug marks the recipe as cooked', async () => {
    const controller = new CookLogController(cookLogService as any)
    const result = await controller.mark('a', { userId: 'user_1' } as any)
    expect(cookLogService.markCooked).toHaveBeenCalledWith('user_1', 'a')
    expect(result).toEqual({ cooked: true })
  })

  it('DELETE /cooked/:slug unmarks the recipe as cooked', async () => {
    const controller = new CookLogController(cookLogService as any)
    const result = await controller.unmark('a', { userId: 'user_1' } as any)
    expect(cookLogService.unmarkCooked).toHaveBeenCalledWith('user_1', 'a')
    expect(result).toEqual({ cooked: false })
  })
})
