import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { TimersService } from './timers.service'
import { Timer } from './schemas/timer.schema'
import { PushService } from './push.service'

describe('TimersService', () => {
  const timerModel = {
    findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
    find: jest.fn(),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) }),
  }
  const pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) }

  beforeEach(() => jest.clearAllMocks())

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TimersService,
        { provide: getModelToken(Timer.name), useValue: timerModel },
        { provide: PushService, useValue: pushService },
      ],
    }).compile()
    return moduleRef.get(TimersService)
  }

  it('upsert writes by (userId, clientId) with pushSent reset to false', async () => {
    const service = await makeService()
    await service.upsert('user_1', 'timer-1', 'recipe_1', 'Pasta', 12345)
    expect(timerModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user_1', clientId: 'timer-1' },
      { userId: 'user_1', clientId: 'timer-1', recipeId: 'recipe_1', label: 'Pasta', endsAt: 12345, pushSent: false },
      { upsert: true },
    )
  })

  it('remove deletes by (userId, clientId)', async () => {
    const service = await makeService()
    await service.remove('user_1', 'timer-1')
    expect(timerModel.deleteOne).toHaveBeenCalledWith({ userId: 'user_1', clientId: 'timer-1' })
  })

  it('sweepDueTimers finds due unsent timers, sends a push per timer, and marks each pushSent', async () => {
    const due = [
      { _id: 'a', userId: 'user_1', clientId: 'timer-1', label: 'Pasta', endsAt: 1000, pushSent: false },
      { _id: 'b', userId: 'user_2', clientId: 'timer-2', label: 'Rice', endsAt: 2000, pushSent: false },
    ]
    timerModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue(due) })
    const service = await makeService()

    await service.sweepDueTimers()

    expect(timerModel.find).toHaveBeenCalledWith({ endsAt: { $lte: expect.any(Number) }, pushSent: false })
    expect(pushService.sendToUser).toHaveBeenCalledWith('user_1', { title: 'Timer done', body: 'Pasta' })
    expect(pushService.sendToUser).toHaveBeenCalledWith('user_2', { title: 'Timer done', body: 'Rice' })
    expect(timerModel.updateOne).toHaveBeenCalledWith({ _id: 'a' }, { $set: { pushSent: true } })
    expect(timerModel.updateOne).toHaveBeenCalledWith({ _id: 'b' }, { $set: { pushSent: true } })
  })

  it('sweepDueTimers does nothing when no timers are due', async () => {
    timerModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
    const service = await makeService()

    await service.sweepDueTimers()

    expect(pushService.sendToUser).not.toHaveBeenCalled()
    expect(timerModel.updateOne).not.toHaveBeenCalled()
  })
})
