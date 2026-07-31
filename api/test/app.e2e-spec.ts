import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { AppModule } from '../src/app.module'

// No real Redis runs in tests; the real ioredis client would keep a reconnect
// timer open and prevent Jest from exiting after the suite finishes.
jest.mock('ioredis', () => require('ioredis-mock'))

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn().mockResolvedValue({ sub: 'user_1' }),
  createClerkClient: jest.fn(() => ({
    users: {
      getUser: jest
        .fn()
        .mockResolvedValue({ emailAddresses: [{ emailAddress: 'a@b.com' }], firstName: 'A' }),
    },
  })),
}))

describe('Recipes flow (e2e)', () => {
  let app: INestApplication
  let mongod: MongoMemoryServer

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    process.env.MONGO_URI = mongod.getUri()
    process.env.REDIS_URL = 'redis://localhost:6379'
    process.env.CLERK_SECRET_KEY = 'sk_test_xxx'

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await mongod.stop()
  })

  it('rejects unauthenticated requests to /recipes', async () => {
    await request(app.getHttpServer()).get('/recipes').expect(401)
  })

  it('serves recipes and logs a view for authenticated requests', async () => {
    const recipeModel = app.get('RecipeModel')
    await recipeModel.create({
      slug: 'test-recipe',
      title: 'Test Recipe',
      category: 'dessert',
      image: 'https://assets.tugy.dev/test.jpg',
      description: 'A test',
      prepTime: 5,
      cookTime: 10,
      servings: 2,
      difficulty: 'easy',
      tags: [],
      ingredients: [],
      steps: [],
    })

    const listRes = await request(app.getHttpServer())
      .get('/recipes')
      .set('Authorization', 'Bearer faketoken')
      .expect(200)
    expect(listRes.body).toHaveLength(1)

    await request(app.getHttpServer())
      .get('/recipes/test-recipe')
      .set('Authorization', 'Bearer faketoken')
      .expect(200)

    const activityModel = app.get('ActivityLogModel')
    const logs = await activityModel.find({ action: 'recipe_viewed' })
    expect(logs).toHaveLength(1)
    expect(logs[0].userId).toBe('user_1')
    expect(logs[0].recipeId).toBe('test-recipe')
  })
})
