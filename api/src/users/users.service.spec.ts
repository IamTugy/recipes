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

  it('namesByIds returns a map of clerkUserId to name for known users', async () => {
    const exec = jest.fn().mockResolvedValue([{ clerkUserId: 'user_1', name: 'A' }, { clerkUserId: 'user_2', name: undefined }])
    const lean = jest.fn().mockReturnValue({ exec })
    const find = jest.fn().mockReturnValue({ lean })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.namesByIds(['user_1', 'user_2', 'user_1'])

    expect(find).toHaveBeenCalledWith({ clerkUserId: { $in: ['user_1', 'user_2'] } })
    expect(result).toEqual({ user_1: 'A', user_2: undefined })
  })

  it('namesByIds returns an empty object without querying when given no ids', async () => {
    const find = jest.fn()
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.namesByIds([])

    expect(find).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('search matches by name (case-insensitive), excludes the searcher, and limits to 20', async () => {
    const exec = jest.fn().mockResolvedValue([
      { clerkUserId: 'user_2', name: 'Bob Baker', imageUrl: 'https://img.clerk.dev/b.jpg' },
    ])
    const lean = jest.fn().mockReturnValue({ exec })
    const limit = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ limit })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.search('bob', 'user_1')

    expect(find).toHaveBeenCalledWith({
      clerkUserId: { $ne: 'user_1' },
      name: { $regex: 'bob', $options: 'i' },
    })
    expect(limit).toHaveBeenCalledWith(20)
    expect(result).toEqual([{ userId: 'user_2', name: 'Bob Baker', imageUrl: 'https://img.clerk.dev/b.jpg' }])
  })

  it('search returns an empty array without querying for a blank query', async () => {
    const find = jest.fn()
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.search('   ', 'user_1')

    expect(find).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('search escapes regex special characters in the query', async () => {
    const exec = jest.fn().mockResolvedValue([])
    const lean = jest.fn().mockReturnValue({ exec })
    const limit = jest.fn().mockReturnValue({ lean })
    const find = jest.fn().mockReturnValue({ limit })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    await service.search('a.b(c', 'user_1')

    expect(find).toHaveBeenCalledWith({
      clerkUserId: { $ne: 'user_1' },
      name: { $regex: 'a\\.b\\(c', $options: 'i' },
    })
  })

  it('getPreferences returns lang/theme for a known user', async () => {
    const exec = jest.fn().mockResolvedValue({ lang: 'he', theme: 'dark' })
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const findOne = jest.fn().mockReturnValue({ select })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { findOne } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.getPreferences('user_1')

    expect(findOne).toHaveBeenCalledWith({ clerkUserId: 'user_1' })
    expect(result).toEqual({ lang: 'he', theme: 'dark' })
  })

  it('getPreferences returns undefined fields when the user has none set', async () => {
    const exec = jest.fn().mockResolvedValue(null)
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const findOne = jest.fn().mockReturnValue({ select })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { findOne } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.getPreferences('user_1')

    expect(result).toEqual({ lang: undefined, theme: undefined })
  })

  it('setPreferences only $sets the provided fields', async () => {
    const exec = jest.fn().mockResolvedValue({ lang: 'en', theme: undefined })
    const lean = jest.fn().mockReturnValue({ exec })
    const select = jest.fn().mockReturnValue({ lean })
    const findOneAndUpdate = jest.fn().mockReturnValue({ select })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { findOneAndUpdate } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.setPreferences('user_1', { lang: 'en' })

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { clerkUserId: 'user_1' },
      { $set: { lang: 'en' } },
      { new: true, upsert: false },
    )
    expect(result).toEqual({ lang: 'en', theme: undefined })
  })

  it('profilesByIds returns a map of clerkUserId to name/imageUrl for known users', async () => {
    const exec = jest.fn().mockResolvedValue([
      { clerkUserId: 'user_1', name: 'A B', imageUrl: 'https://img.clerk.dev/a.jpg' },
      { clerkUserId: 'user_2', name: undefined, imageUrl: undefined },
    ])
    const lean = jest.fn().mockReturnValue({ exec })
    const find = jest.fn().mockReturnValue({ lean })
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.profilesByIds(['user_1', 'user_2', 'user_1'])

    expect(find).toHaveBeenCalledWith({ clerkUserId: { $in: ['user_1', 'user_2'] } })
    expect(result).toEqual({
      user_1: { name: 'A B', imageUrl: 'https://img.clerk.dev/a.jpg' },
      user_2: { name: undefined, imageUrl: undefined },
    })
  })

  it('profilesByIds returns an empty object without querying when given no ids', async () => {
    const find = jest.fn()
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: { find } }],
    }).compile()

    const service = moduleRef.get(UsersService)
    const result = await service.profilesByIds([])

    expect(find).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })
})
