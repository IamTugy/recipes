import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { UsersService } from './users.service'
import { User } from './schemas/user.schema'

describe('UsersService', () => {
  it('upserts a user by clerkUserId, updating name/email on repeat calls', async () => {
    const findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ clerkUserId: 'user_1', email: 'a@b.com', name: 'A' }),
    })
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: { findOneAndUpdate } },
      ],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.upsertFromClerk('user_1', 'a@b.com', 'A')

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { clerkUserId: 'user_1' },
      { clerkUserId: 'user_1', email: 'a@b.com', name: 'A' },
      { upsert: true, new: true },
    )
    expect(result).toEqual({ clerkUserId: 'user_1', email: 'a@b.com', name: 'A' })
  })
})
