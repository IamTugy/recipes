# Backend Foundation (Auth + Data Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a NestJS API (`api/`) with Clerk-gated auth, Mongo + Redis data layer, and recipe content migrated from the existing YAML files, wired into the existing static frontend via an nginx reverse proxy.

**Architecture:** New `api/` NestJS project in the existing `IamTugy/recipes` repo. `MongooseModule` for durable data (`users`, `recipes`, `favorites`, `ratings`, `activity_log`), a small `RedisModule` wrapping `ioredis` for ephemeral data (unused by business logic yet, wired for sub-project 3 to build on). A global `ClerkAuthGuard` verifies every request's Bearer token via `@clerk/backend` and upserts the user on first sight. Recipes are seeded from `src/data/recipes/*.yaml` into Mongo on boot; the API serves them read-only.

**Tech Stack:** NestJS 10, TypeScript, Mongoose, ioredis, `@clerk/backend`, `js-yaml`, Jest, `mongodb-memory-server` (tests), `ioredis-mock` (tests).

## Global Constraints

- Recipes stay authored as YAML in `src/data/recipes/` (git PR workflow unchanged) — the seed step is the only writer of the Mongo `recipes` collection.
- No recipe admin CRUD UI/API in this sub-project.
- No favorites/ratings read-or-write logic in this sub-project — only their Mongoose schemas/indexes exist.
- No timer/session Redis logic in this sub-project — only a working `RedisModule` with a health check.
- No activity-log dashboard/read endpoint in this sub-project — only the write path (`ActivityLogService.record`), called for `recipe_viewed`.
- Every `/api/*` route requires a valid Clerk session token; missing/invalid/expired → 401.
- Existing frontend `Dockerfile`, `nginx.conf`, and root-level CI paths must keep working unmodified except where this plan explicitly says to touch them.
- Deviation from spec (approved simplification): Redis integration tests use `ioredis-mock` instead of `testcontainers`, avoiding Docker-in-CI complexity for a healthcheck-only client at this stage.

---

### Task 1: Scaffold the NestJS project with a health endpoint

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/nest-cli.json`
- Create: `api/src/main.ts`
- Create: `api/src/app.module.ts`
- Create: `api/src/health/health.controller.ts`
- Create: `api/src/health/health.controller.spec.ts`
- Create: `api/Dockerfile`
- Create: `api/.dockerignore`
- Create: `api/.env.example`

**Interfaces:**
- Produces: `AppModule` (root module, imported/extended by later tasks), `HealthController` with `GET /health` returning `{ status: 'ok' }`.

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "name": "recipes-api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "test": "jest",
    "seed": "node dist/recipes/seed-recipes.js"
  },
  "dependencies": {
    "@clerk/backend": "^1.13.0",
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^3.3.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/mongoose": "^10.1.0",
    "@nestjs/platform-express": "^10.4.0",
    "ioredis": "^5.4.1",
    "js-yaml": "^4.1.1",
    "mongoose": "^8.9.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "@nestjs/schematics": "^10.2.3",
    "@nestjs/testing": "^10.4.0",
    "@types/jest": "^29.5.14",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "ioredis-mock": "^8.9.0",
    "jest": "^29.7.0",
    "mongodb-memory-server": "^10.1.2",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "declaration": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true
  }
}
```

- [ ] **Step 3: Create `api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

- [ ] **Step 4: Create `api/.env.example`**

```
PORT=3000
MONGO_URI=mongodb://localhost:27017/recipes
REDIS_URL=redis://localhost:6379
CLERK_SECRET_KEY=sk_test_xxx
RECIPE_DATA_DIR=../src/data/recipes
```

- [ ] **Step 5: Create `api/src/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' }
  }
}
```

- [ ] **Step 6: Write the failing test `api/src/health/health.controller.spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('returns ok status', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile()

    const controller = moduleRef.get(HealthController)
    expect(controller.check()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 7: Create `api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 8: Create `api/src/main.ts`**

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = process.env.PORT ?? 3000
  await app.listen(port)
}

bootstrap()
```

- [ ] **Step 9: Install deps and run the test**

Run: `cd api && npm install && npm test`
Expected: PASS (`HealthController returns ok status`)

- [ ] **Step 10: Create `api/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY api/package*.json ./
RUN npm ci
COPY api/. .
COPY src/data/recipes ./recipe-data
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV RECIPE_DATA_DIR=./recipe-data
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/recipe-data ./recipe-data
EXPOSE 80
CMD ["node", "dist/main.js"]
```

- [ ] **Step 11: Create `api/.dockerignore`**

```
node_modules
dist
.env
```

- [ ] **Step 12: Commit**

```bash
git add api/
git commit -m "feat(api): scaffold NestJS project with health endpoint"
```

---

### Task 2: Mongo module

**Files:**
- Create: `api/src/mongo/mongo.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `AppModule` from Task 1.
- Produces: `MongoModule` (exports `MongooseModule` registration; any later module does `MongooseModule.forFeature([...])` and it resolves against this connection since it's registered in `AppModule.imports`).

- [ ] **Step 1: Create `api/src/mongo/mongo.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),
  ],
})
export class MongoModule {}
```

- [ ] **Step 2: Wire into `api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Verify boot against a local Mongo (manual smoke check)**

Run: `docker run --rm -d -p 27017:27017 --name mongo-smoke mongo:7` then `cd api && npm run build && MONGO_URI=mongodb://localhost:27017/recipes node dist/main.js`
Expected: process starts with no connection error logged; stop with `docker stop mongo-smoke`.

- [ ] **Step 4: Commit**

```bash
git add api/src/mongo api/src/app.module.ts
git commit -m "feat(api): add Mongo connection module"
```

---

### Task 3: Redis module (parallelizable with Task 2)

**Files:**
- Create: `api/src/redis/redis.module.ts`
- Create: `api/src/redis/redis.service.ts`
- Create: `api/src/redis/redis.service.spec.ts`
- Modify: `api/src/health/health.controller.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `AppModule` from Task 1.
- Produces: `RedisService` with `ping(): Promise<boolean>` and `getClient(): Redis` — sub-project 3 will inject `RedisService` for timer/session data.

- [ ] **Step 1: Write the failing test `api/src/redis/redis.service.spec.ts`**

```ts
import RedisMock from 'ioredis-mock'
import { RedisService } from './redis.service'

describe('RedisService', () => {
  it('ping returns true when redis responds PONG', async () => {
    const service = new RedisService(new RedisMock() as any)
    await expect(service.ping()).resolves.toBe(true)
  })

  it('ping returns false when redis throws', async () => {
    const client = new RedisMock()
    client.ping = jest.fn().mockRejectedValue(new Error('down'))
    const service = new RedisService(client as any)
    await expect(service.ping()).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npm test -- redis.service.spec.ts`
Expected: FAIL (`Cannot find module './redis.service'`)

- [ ] **Step 3: Create `api/src/redis/redis.service.ts`**

```ts
import { Injectable, Inject } from '@nestjs/common'
import type Redis from 'ioredis'

export const REDIS_CLIENT = 'REDIS_CLIENT'

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping()
      return reply === 'PONG'
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 4: Create `api/src/redis/redis.module.ts`**

```ts
import { Module, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { RedisService, REDIS_CLIENT } from './redis.service'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.get<string>('REDIS_URL')!),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npm test -- redis.service.spec.ts`
Expected: PASS (both cases)

- [ ] **Step 6: Extend `api/src/health/health.controller.ts` to report Redis status**

```ts
import { Controller, Get } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  async check() {
    const redisOk = await this.redis.ping()
    return { status: 'ok', redis: redisOk ? 'ok' : 'unavailable' }
  }
}
```

- [ ] **Step 7: Update `api/src/health/health.controller.spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller'
import { RedisService } from '../redis/redis.service'

describe('HealthController', () => {
  it('reports redis ok when ping succeeds', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: RedisService, useValue: { ping: async () => true } }],
    }).compile()

    const controller = moduleRef.get(HealthController)
    await expect(controller.check()).resolves.toEqual({ status: 'ok', redis: 'ok' })
  })

  it('reports redis unavailable when ping fails', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: RedisService, useValue: { ping: async () => false } }],
    }).compile()

    const controller = moduleRef.get(HealthController)
    await expect(controller.check()).resolves.toEqual({ status: 'ok', redis: 'unavailable' })
  })
})
```

- [ ] **Step 8: Wire `RedisModule` into `api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'
import { RedisModule } from './redis/redis.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
    RedisModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 9: Run full test suite**

Run: `cd api && npm test`
Expected: PASS (all suites)

- [ ] **Step 10: Commit**

```bash
git add api/src/redis api/src/health api/src/app.module.ts
git commit -m "feat(api): add Redis module with health check"
```

---

### Task 4: Users schema + Clerk auth guard (global)

**Files:**
- Create: `api/src/users/schemas/user.schema.ts`
- Create: `api/src/users/users.service.ts`
- Create: `api/src/users/users.service.spec.ts`
- Create: `api/src/users/users.module.ts`
- Create: `api/src/auth/clerk-auth.guard.ts`
- Create: `api/src/auth/clerk-auth.guard.spec.ts`
- Create: `api/src/auth/auth.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `MongoModule` from Task 2 (`MongooseModule.forFeature` pattern).
- Produces: `UsersService.upsertFromClerk(clerkUserId: string, email: string, name: string): Promise<UserDocument>`. `ClerkAuthGuard` (implements `CanActivate`), attaches `req.userId = <clerk user id>` on success — later tasks (recipes controller, activity log) read `req.userId`.

- [ ] **Step 1: Create `api/src/users/schemas/user.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  clerkUserId!: string

  @Prop({ required: true })
  email!: string

  @Prop()
  name?: string
}

export const UserSchema = SchemaFactory.createForClass(User)
```

- [ ] **Step 2: Write the failing test `api/src/users/users.service.spec.ts`**

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npm test -- users.service.spec.ts`
Expected: FAIL (`Cannot find module './users.service'`)

- [ ] **Step 4: Create `api/src/users/users.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument } from './schemas/user.schema'

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async upsertFromClerk(clerkUserId: string, email: string, name?: string): Promise<UserDocument> {
    return this.userModel
      .findOneAndUpdate(
        { clerkUserId },
        { clerkUserId, email, name },
        { upsert: true, new: true },
      )
      .exec()
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npm test -- users.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Create `api/src/users/users.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { UsersService } from './users.service'

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 7: Write the failing test `api/src/auth/clerk-auth.guard.spec.ts`**

```ts
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { ClerkAuthGuard } from './clerk-auth.guard'

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
  createClerkClient: jest.fn(() => ({
    users: { getUser: jest.fn().mockResolvedValue({ emailAddresses: [{ emailAddress: 'a@b.com' }], firstName: 'A' }) },
  })),
}))

import { verifyToken } from '@clerk/backend'

function contextWithHeader(header?: string): ExecutionContext {
  const req: any = { headers: header ? { authorization: header } : {} }
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext
}

describe('ClerkAuthGuard', () => {
  const usersService = { upsertFromClerk: jest.fn() }
  const configService = { get: () => 'sk_test_xxx' }

  beforeEach(() => jest.clearAllMocks())

  it('rejects when no Authorization header is present', async () => {
    const guard = new ClerkAuthGuard(configService as any, usersService as any)
    await expect(guard.canActivate(contextWithHeader())).rejects.toThrow(UnauthorizedException)
  })

  it('rejects when token verification fails', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValue(new Error('bad token'))
    const guard = new ClerkAuthGuard(configService as any, usersService as any)
    await expect(guard.canActivate(contextWithHeader('Bearer badtoken'))).rejects.toThrow(UnauthorizedException)
  })

  it('attaches userId and upserts the user on valid token', async () => {
    ;(verifyToken as jest.Mock).mockResolvedValue({ sub: 'user_1' })
    const guard = new ClerkAuthGuard(configService as any, usersService as any)
    const req: any = { headers: { authorization: 'Bearer goodtoken' } }
    const context = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }) } as unknown as ExecutionContext

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(req.userId).toBe('user_1')
    expect(usersService.upsertFromClerk).toHaveBeenCalledWith('user_1', 'a@b.com', 'A')
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd api && npm test -- clerk-auth.guard.spec.ts`
Expected: FAIL (`Cannot find module './clerk-auth.guard'`)

- [ ] **Step 9: Create `api/src/auth/clerk-auth.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { verifyToken, createClerkClient } from '@clerk/backend'
import { UsersService } from '../users/users.service'

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader: string | undefined = request.headers?.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }
    const token = authHeader.slice('Bearer '.length)
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY')!

    let userId: string
    try {
      const payload = await verifyToken(token, { secretKey })
      userId = payload.sub
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }

    request.userId = userId

    const clerkClient = createClerkClient({ secretKey })
    const clerkUser = await clerkClient.users.getUser(userId)
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
    const name = clerkUser.firstName ?? undefined
    await this.usersService.upsertFromClerk(userId, email, name)

    return true
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd api && npm test -- clerk-auth.guard.spec.ts`
Expected: PASS (all 3 cases)

- [ ] **Step 11: Create `api/src/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { UsersModule } from '../users/users.module'
import { ClerkAuthGuard } from './clerk-auth.guard'

@Module({
  imports: [UsersModule],
  providers: [{ provide: APP_GUARD, useClass: ClerkAuthGuard }],
})
export class AuthModule {}
```

- [ ] **Step 12: Wire `AuthModule` into `api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'
import { RedisModule } from './redis/redis.module'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
    RedisModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 13: Exempt `/health` from the global guard**

Modify `api/src/health/health.controller.ts` to add `@Public()` support — simplest correct approach: use a metadata key checked by the guard.

Update `api/src/auth/clerk-auth.guard.ts` to check for a `Public` route decorator before enforcing auth:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { verifyToken, createClerkClient } from '@clerk/backend'
import { UsersService } from '../users/users.service'
import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const authHeader: string | undefined = request.headers?.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }
    const token = authHeader.slice('Bearer '.length)
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY')!

    let userId: string
    try {
      const payload = await verifyToken(token, { secretKey })
      userId = payload.sub
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }

    request.userId = userId

    const clerkClient = createClerkClient({ secretKey })
    const clerkUser = await clerkClient.users.getUser(userId)
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
    const name = clerkUser.firstName ?? undefined
    await this.usersService.upsertFromClerk(userId, email, name)

    return true
  }
}
```

Create `api/src/auth/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
```

Update the guard's test file (Step 7) constructor calls to pass a `Reflector` stub as the first arg, e.g. `{ getAllAndOverride: () => false }`, in every `new ClerkAuthGuard(...)` call — update all three call sites to `new ClerkAuthGuard({ getAllAndOverride: () => false } as any, configService as any, usersService as any)`.

Update `api/src/health/health.controller.ts` to mark the route public:

```ts
import { Controller, Get } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'
import { Public } from '../auth/public.decorator'

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Public()
  @Get()
  async check() {
    const redisOk = await this.redis.ping()
    return { status: 'ok', redis: redisOk ? 'ok' : 'unavailable' }
  }
}
```

- [ ] **Step 14: Run full test suite**

Run: `cd api && npm test`
Expected: PASS (all suites)

- [ ] **Step 15: Commit**

```bash
git add api/src/users api/src/auth api/src/health api/src/app.module.ts
git commit -m "feat(api): add users schema and global Clerk auth guard"
```

---

### Task 5: Recipes module — schema, service, controller, seed script (parallelizable with Task 6)

**Files:**
- Create: `api/src/recipes/schemas/recipe.schema.ts`
- Create: `api/src/recipes/recipes.service.ts`
- Create: `api/src/recipes/recipes.service.spec.ts`
- Create: `api/src/recipes/recipes.controller.ts`
- Create: `api/src/recipes/recipes.controller.spec.ts`
- Create: `api/src/recipes/recipes.module.ts`
- Create: `api/src/recipes/seed-recipes.ts`
- Create: `api/src/recipes/seed-recipes.spec.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `MongoModule` (Task 2). Existing `Recipe` TypeScript shape from `src/types.ts` (id, title, titleHe?, category, tags, tagsEn?, cuisine?, image, description, descriptionEn?, prepTime, cookTime, servings, difficulty, ingredients, steps, source?, featured?, hidden?, tips?, tipsEn?).
- Produces: `RecipesService.findAll(): Promise<RecipeDocument[]>`, `RecipesService.findBySlug(slug: string): Promise<RecipeDocument | null>` — consumed by Task 7 (activity log call site lives in `RecipesController`).

- [ ] **Step 1: Create `api/src/recipes/schemas/recipe.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type RecipeDocument = Recipe & Document

@Schema({ timestamps: true })
export class Recipe {
  @Prop({ required: true, unique: true, index: true })
  slug!: string

  @Prop({ required: true })
  title!: string

  @Prop()
  titleHe?: string

  @Prop({ required: true })
  category!: string

  @Prop({ type: [String], default: [] })
  tags!: string[]

  @Prop({ type: [String] })
  tagsEn?: string[]

  @Prop()
  cuisine?: string

  @Prop({ required: true })
  image!: string

  @Prop({ required: true })
  description!: string

  @Prop()
  descriptionEn?: string

  @Prop({ required: true })
  prepTime!: number

  @Prop({ required: true })
  cookTime!: number

  @Prop({ required: true })
  servings!: number

  @Prop({ required: true })
  difficulty!: string

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  ingredients!: unknown[]

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  steps!: unknown[]

  @Prop()
  source?: string

  @Prop({ default: false })
  featured?: boolean

  @Prop({ default: false })
  hidden?: boolean

  @Prop({ type: [String] })
  tips?: string[]

  @Prop({ type: [String] })
  tipsEn?: string[]
}

export const RecipeSchema = SchemaFactory.createForClass(Recipe)
```

- [ ] **Step 2: Write the failing test `api/src/recipes/recipes.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { RecipesService } from './recipes.service'
import { Recipe } from './schemas/recipe.schema'

describe('RecipesService', () => {
  it('findAll returns all non-hidden recipes', async () => {
    const exec = jest.fn().mockResolvedValue([{ slug: 'a' }])
    const find = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [RecipesService, { provide: getModelToken(Recipe.name), useValue: { find, findOne: jest.fn() } }],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findAll()

    expect(find).toHaveBeenCalledWith({ hidden: { $ne: true } })
    expect(result).toEqual([{ slug: 'a' }])
  })

  it('findBySlug returns the matching recipe', async () => {
    const exec = jest.fn().mockResolvedValue({ slug: 'a' })
    const findOne = jest.fn().mockReturnValue({ exec })
    const moduleRef = await Test.createTestingModule({
      providers: [RecipesService, { provide: getModelToken(Recipe.name), useValue: { find: jest.fn(), findOne } }],
    }).compile()

    const service = moduleRef.get(RecipesService)
    const result = await service.findBySlug('a')

    expect(findOne).toHaveBeenCalledWith({ slug: 'a' })
    expect(result).toEqual({ slug: 'a' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npm test -- recipes.service.spec.ts`
Expected: FAIL (`Cannot find module './recipes.service'`)

- [ ] **Step 4: Create `api/src/recipes/recipes.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from './schemas/recipe.schema'

@Injectable()
export class RecipesService {
  constructor(@InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>) {}

  async findAll(): Promise<RecipeDocument[]> {
    return this.recipeModel.find({ hidden: { $ne: true } }).exec()
  }

  async findBySlug(slug: string): Promise<RecipeDocument | null> {
    return this.recipeModel.findOne({ slug }).exec()
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npm test -- recipes.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Write the failing test `api/src/recipes/recipes.controller.spec.ts`**

```ts
import { NotFoundException } from '@nestjs/common'
import { RecipesController } from './recipes.controller'

describe('RecipesController', () => {
  const recipesService = { findAll: jest.fn(), findBySlug: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('GET /recipes returns all recipes', async () => {
    recipesService.findAll.mockResolvedValue([{ slug: 'a' }])
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    await expect(controller.findAll()).resolves.toEqual([{ slug: 'a' }])
  })

  it('GET /recipes/:slug returns the recipe and logs a view', async () => {
    recipesService.findBySlug.mockResolvedValue({ slug: 'a' })
    const activityLog = { record: jest.fn() }
    const controller = new RecipesController(recipesService as any, activityLog as any)

    const result = await controller.findOne('a', { userId: 'user_1' } as any)

    expect(result).toEqual({ slug: 'a' })
    expect(activityLog.record).toHaveBeenCalledWith('user_1', 'a', 'recipe_viewed')
  })

  it('GET /recipes/:slug throws 404 when not found', async () => {
    recipesService.findBySlug.mockResolvedValue(null)
    const controller = new RecipesController(recipesService as any, { record: jest.fn() } as any)
    await expect(controller.findOne('missing', { userId: 'user_1' } as any)).rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd api && npm test -- recipes.controller.spec.ts`
Expected: FAIL (`Cannot find module './recipes.controller'`)

- [ ] **Step 8: Create `api/src/recipes/recipes.controller.ts`**

Note: `ActivityLogService` is created in Task 7. This step defines the controller against its already-agreed interface (`record(userId: string, recipeId: string, action: string): Promise<void>`); Task 7 provides the implementation. If Task 7 hasn't landed yet when this step runs, create a matching stub `api/src/activity-log/activity-log.service.ts` with just that method throwing `Error('not implemented')`, to be overwritten by Task 7.

```ts
import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common'
import { Request } from 'express'
import { RecipesService } from './recipes.service'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async findAll() {
    return this.recipesService.findAll()
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const recipe = await this.recipesService.findBySlug(slug)
    if (!recipe) {
      throw new NotFoundException(`Recipe '${slug}' not found`)
    }
    await this.activityLog.record(req.userId, slug, 'recipe_viewed')
    return recipe
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd api && npm test -- recipes.controller.spec.ts`
Expected: PASS (all 3 cases)

- [ ] **Step 10: Write the failing test `api/src/recipes/seed-recipes.spec.ts`**

```ts
import * as fs from 'fs'
import * as path from 'path'
import { parseRecipeFiles } from './seed-recipes'

describe('parseRecipeFiles', () => {
  const tmpDir = path.join(__dirname, '__fixtures__')

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(
      path.join(tmpDir, 'test-recipe.yaml'),
      [
        'id: test-recipe',
        'title: Test Recipe',
        'category: dessert',
        'image: https://assets.tugy.dev/test.jpg',
        'description: A test',
        'prepTime: 5',
        'cookTime: 10',
        'servings: 2',
        'difficulty: easy',
        'tags: []',
        'ingredients: []',
        'steps: []',
      ].join('\n'),
    )
  })

  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

  it('parses every yaml file in the directory into a recipe with slug = id', () => {
    const recipes = parseRecipeFiles(tmpDir)
    expect(recipes).toHaveLength(1)
    expect(recipes[0]).toMatchObject({ slug: 'test-recipe', title: 'Test Recipe' })
  })
})
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd api && npm test -- seed-recipes.spec.ts`
Expected: FAIL (`Cannot find module './seed-recipes'`)

- [ ] **Step 12: Create `api/src/recipes/seed-recipes.ts`**

```ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import mongoose from 'mongoose'
import { Recipe, RecipeSchema } from './schemas/recipe.schema'

export function parseRecipeFiles(dir: string): Record<string, unknown>[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const parsed = yaml.load(raw) as Record<string, unknown>
      return { ...parsed, slug: parsed.id }
    })
}

export async function seedRecipes(mongoUri: string, dataDir: string): Promise<number> {
  await mongoose.connect(mongoUri)
  const RecipeModel = mongoose.model(Recipe.name, RecipeSchema)
  const recipes = parseRecipeFiles(dataDir)

  for (const recipe of recipes) {
    await RecipeModel.findOneAndUpdate({ slug: recipe.slug }, recipe, { upsert: true })
  }

  await mongoose.disconnect()
  return recipes.length
}

if (require.main === module) {
  const mongoUri = process.env.MONGO_URI
  const dataDir = process.env.RECIPE_DATA_DIR
  if (!mongoUri || !dataDir) {
    console.error('MONGO_URI and RECIPE_DATA_DIR must be set')
    process.exit(1)
  }
  seedRecipes(mongoUri, dataDir)
    .then((count) => {
      console.log(`Seeded ${count} recipes`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('Seed failed (non-fatal, API will serve existing data):', err)
      process.exit(0)
    })
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd api && npm test -- seed-recipes.spec.ts`
Expected: PASS

- [ ] **Step 14: Create `api/src/recipes/recipes.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Recipe, RecipeSchema } from './schemas/recipe.schema'
import { RecipesService } from './recipes.service'
import { RecipesController } from './recipes.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Recipe.name, schema: RecipeSchema }]),
    ActivityLogModule,
  ],
  providers: [RecipesService],
  controllers: [RecipesController],
  exports: [RecipesService],
})
export class RecipesModule {}
```

- [ ] **Step 15: Wire `RecipesModule` into `api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'
import { RedisModule } from './redis/redis.module'
import { AuthModule } from './auth/auth.module'
import { RecipesModule } from './recipes/recipes.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
    RedisModule,
    AuthModule,
    RecipesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 16: Run full test suite (will fail on missing `ActivityLogModule` until Task 7 lands — acceptable mid-parallel-execution state, must pass before Task 8's integration)**

Run: `cd api && npm test`

- [ ] **Step 17: Commit**

```bash
git add api/src/recipes api/src/app.module.ts
git commit -m "feat(api): add recipes schema, service, controller, and seed script"
```

---

### Task 6: Favorites + ratings schema stubs (parallelizable with Tasks 4 and 5)

**Files:**
- Create: `api/src/favorites/schemas/favorite.schema.ts`
- Create: `api/src/favorites/favorites.module.ts`
- Create: `api/src/ratings/schemas/rating.schema.ts`
- Create: `api/src/ratings/ratings.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `MongoModule` (Task 2).
- Produces: registered Mongoose models `Favorite` and `Rating` with indexes, ready for sub-project 4 to add services/controllers against. No exported service methods in this task — schema only, per spec's non-goals.

- [ ] **Step 1: Create `api/src/favorites/schemas/favorite.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type FavoriteDocument = Favorite & Document

@Schema({ timestamps: true })
export class Favorite {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite)
FavoriteSchema.index({ userId: 1, recipeSlug: 1 }, { unique: true })
```

- [ ] **Step 2: Create `api/src/favorites/favorites.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Favorite, FavoriteSchema } from './schemas/favorite.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: Favorite.name, schema: FavoriteSchema }])],
})
export class FavoritesModule {}
```

- [ ] **Step 3: Create `api/src/ratings/schemas/rating.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type RatingDocument = Rating & Document

@Schema({ timestamps: true })
export class Rating {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeSlug!: string

  @Prop({ required: true, min: 1, max: 5 })
  score!: number
}

export const RatingSchema = SchemaFactory.createForClass(Rating)
RatingSchema.index({ userId: 1, recipeSlug: 1 }, { unique: true })
```

- [ ] **Step 4: Create `api/src/ratings/ratings.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Rating, RatingSchema } from './schemas/rating.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: Rating.name, schema: RatingSchema }])],
})
export class RatingsModule {}
```

- [ ] **Step 5: Wire both modules into `api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'
import { RedisModule } from './redis/redis.module'
import { AuthModule } from './auth/auth.module'
import { RecipesModule } from './recipes/recipes.module'
import { FavoritesModule } from './favorites/favorites.module'
import { RatingsModule } from './ratings/ratings.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
    RedisModule,
    AuthModule,
    RecipesModule,
    FavoritesModule,
    RatingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 6: Verify project still builds**

Run: `cd api && npm run build`
Expected: builds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add api/src/favorites api/src/ratings api/src/app.module.ts
git commit -m "feat(api): add favorites and ratings schema stubs"
```

---

### Task 7: Activity log module

**Files:**
- Create: `api/src/activity-log/schemas/activity-log.schema.ts`
- Create: `api/src/activity-log/activity-log.service.ts`
- Create: `api/src/activity-log/activity-log.service.spec.ts`
- Create: `api/src/activity-log/activity-log.module.ts`

**Interfaces:**
- Consumes: `MongoModule` (Task 2). Consumed by `RecipesController` (Task 5), which imports `ActivityLogModule` and calls `activityLog.record(userId, recipeId, action)`.
- Produces: `ActivityLogService.record(userId: string, recipeId: string, action: string, metadata?: Record<string, unknown>): Promise<void>`.

- [ ] **Step 1: Create `api/src/activity-log/schemas/activity-log.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Schema as MongooseSchema } from 'mongoose'

export type ActivityLogDocument = ActivityLog & Document

@Schema({ timestamps: { createdAt: 'timestamp', updatedAt: false } })
export class ActivityLog {
  @Prop({ required: true, index: true })
  userId!: string

  @Prop({ required: true, index: true })
  recipeId!: string

  @Prop({ required: true, index: true })
  action!: string

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog)
```

- [ ] **Step 2: Write the failing test `api/src/activity-log/activity-log.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ActivityLogService } from './activity-log.service'
import { ActivityLog } from './schemas/activity-log.schema'

describe('ActivityLogService', () => {
  it('record inserts an activity log document', async () => {
    const create = jest.fn().mockResolvedValue({})
    const moduleRef = await Test.createTestingModule({
      providers: [ActivityLogService, { provide: getModelToken(ActivityLog.name), useValue: { create } }],
    }).compile()

    const service = moduleRef.get(ActivityLogService)
    await service.record('user_1', 'recipe-a', 'recipe_viewed')

    expect(create).toHaveBeenCalledWith({
      userId: 'user_1',
      recipeId: 'recipe-a',
      action: 'recipe_viewed',
      metadata: undefined,
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npm test -- activity-log.service.spec.ts`
Expected: FAIL (`Cannot find module './activity-log.service'`)

- [ ] **Step 4: Create `api/src/activity-log/activity-log.service.ts`**

```ts
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ActivityLog, ActivityLogDocument } from './schemas/activity-log.schema'

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectModel(ActivityLog.name) private readonly activityLogModel: Model<ActivityLogDocument>,
  ) {}

  async record(
    userId: string,
    recipeId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.activityLogModel.create({ userId, recipeId, action, metadata })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd api && npm test -- activity-log.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Create `api/src/activity-log/activity-log.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema'
import { ActivityLogService } from './activity-log.service'

@Module({
  imports: [MongooseModule.forFeature([{ name: ActivityLog.name, schema: ActivityLogSchema }])],
  providers: [ActivityLogService],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
```

- [ ] **Step 7: Commit**

```bash
git add api/src/activity-log
git commit -m "feat(api): add activity log schema and write-path service"
```

---

### Task 8: Integration — end-to-end test, seed wiring, final verification

**Files:**
- Create: `api/test/app.e2e-spec.ts`
- Create: `api/jest-e2e.json`
- Modify: `api/src/app.module.ts` (verify all imports from Tasks 2–7 are present; fix if any task landed out of order)
- Modify: `api/package.json` (add `test:e2e` script)

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: a passing full-stack test proving the guard, recipes read path, and activity log write path work together against real in-memory Mongo.

- [ ] **Step 1: Add `test:e2e` script to `api/package.json`**

```json
"test:e2e": "jest --config ./jest-e2e.json"
```

- [ ] **Step 2: Create `api/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 3: Write the failing e2e test `api/test/app.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { AppModule } from '../src/app.module'
import { ClerkAuthGuard } from '../src/auth/clerk-auth.guard'
import { APP_GUARD, Reflector } from '@nestjs/core'

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn().mockResolvedValue({ sub: 'user_1' }),
  createClerkClient: jest.fn(() => ({
    users: { getUser: jest.fn().mockResolvedValue({ emailAddresses: [{ emailAddress: 'a@b.com' }], firstName: 'A' }) },
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
  })
})
```

Note: `app.get('RecipeModel')` / `app.get('ActivityLogModel')` rely on Mongoose's default injection token naming (`getModelToken('Recipe')` resolves to `'RecipeModel'`). If this lookup fails when the test is run, replace both with the exact token from `getModelToken(Recipe.name)` / `getModelToken(ActivityLog.name)` imported from `@nestjs/mongoose`, e.g. `app.get(getModelToken(Recipe.name))`.

- [ ] **Step 4: Run test to verify it fails (before fixes, if any wiring gap exists)**

Run: `cd api && npm run test:e2e`
Expected: either PASS immediately (if Tasks 2–7 wired app.module.ts correctly) or fail with a clear DI error pointing at a missing module import — fix `api/src/app.module.ts` to include every module from Tasks 2–7 if so.

- [ ] **Step 5: Run full unit + e2e suite**

Run: `cd api && npm test && npm run test:e2e`
Expected: PASS across both.

- [ ] **Step 6: Manual Docker build sanity check**

Run: `docker build -f api/Dockerfile -t recipes-api:local .`
Expected: image builds successfully from repo root context.

- [ ] **Step 7: Commit**

```bash
git add api/test api/jest-e2e.json api/package.json api/src/app.module.ts
git commit -m "test(api): add end-to-end auth + recipes + activity log test"
```

---

### Task 9: CI — build both images and dispatch a multi-component deploy

Follows the existing `adifinki` multi-component precedent in the server repo (`.github/workflows/deploy-adifinki.yaml`): one dispatch workflow taking an image input per component, applied together with `kubectl apply -f <dir>/ --recursive`.

**Files:**
- Modify: `.github/workflows/deploy.yaml`

**Interfaces:**
- Consumes: `api/Dockerfile` from Task 1, `k8s/apps/recipes/` nested layout from Task 10.
- Produces: on push to `main`, both `tugy/recipes` and `tugy/recipes-api` images are built/pushed, then a single `deploy-recipes.yaml` dispatch fires in the server repo with both image tags.

- [ ] **Step 1: Modify `.github/workflows/deploy.yaml`**

```yaml
name: Deploy

on:
  push:
    branches:
      - main
    tags:
      - 'v*'

env:
  DOCKERHUB_USER: tugy

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - app: recipes
            dockerfile: Dockerfile
          - app: recipes-api
            dockerfile: api/Dockerfile
    outputs:
      recipes_image: ${{ steps.capture.outputs.recipes_image }}
      recipes_api_image: ${{ steps.capture.outputs.recipes_api_image }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.DOCKERHUB_USER }}/${{ matrix.app }}
          tags: |
            type=sha,priority=610
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Login to DockerHub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USER }}
          password: ${{ secrets.DOCKER_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          platforms: linux/amd64,linux/arm64
          cache-from: type=registry,ref=${{ env.DOCKERHUB_USER }}/${{ matrix.app }}:buildcache
          cache-to: type=registry,ref=${{ env.DOCKERHUB_USER }}/${{ matrix.app }}:buildcache,mode=max

      - name: Capture image tag
        id: capture
        run: |
          TAG="${{ fromJSON(steps.meta.outputs.json).tags[0] }}"
          echo "${{ matrix.app == 'recipes' && 'recipes_image' || 'recipes_api_image' }}=$TAG" >> "$GITHUB_OUTPUT"

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Generate a token
        id: generate-token
        uses: actions/create-github-app-token@v1
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          repositories: |
            server

      - name: Trigger deploy
        env:
          GH_TOKEN: ${{ steps.generate-token.outputs.token }}
        run: |
          gh workflow run -R IamTugy/server deploy-recipes.yaml \
            -f "recipes_image=${{ needs.build.outputs.recipes_image }}" \
            -f "recipes_api_image=${{ needs.build.outputs.recipes_api_image }}"
```

Note: matrix job outputs across parallel matrix runs overwrite each other in plain `outputs:` — GitHub Actions does not merge matrix outputs automatically. If this causes only one of `recipes_image`/`recipes_api_image` to survive, switch to writing each tag to a per-matrix artifact file and have `deploy` download both, e.g. `echo "$TAG" > ${{ matrix.app }}.tag` + `actions/upload-artifact@v4`, then `actions/download-artifact@v4` with `merge-multiple: true` in the `deploy` job before reading the files.

- [ ] **Step 2: Validate YAML syntax**

Run: `cd /Users/tugy/git/recipes && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yaml'))"`
Expected: no error printed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yaml
git commit -m "ci: build both recipes images and dispatch multi-component deploy"
```

---

### Task 10: Server repo — k8s manifests for Mongo, Redis, and recipes-api

**Files (all in `~/git/server`):**
- Create: `k8s/apps/mongo/statefulset.yaml`
- Create: `k8s/apps/mongo/service.yaml`
- Create: `k8s/apps/mongo/network-policy.yaml`
- Create: `k8s/apps/redis/statefulset.yaml`
- Create: `k8s/apps/redis/service.yaml`
- Create: `k8s/apps/redis/network-policy.yaml`
- Create: `k8s/apps/recipes-api/deployment.yaml`
- Create: `k8s/apps/recipes-api/service.yaml`
- Create: `k8s/apps/recipes-api/network-policy.yaml`
- Modify: `k8s/apps/recipes/network-policy.yaml` (allow egress to `recipes-api`)

**Interfaces:**
- Consumes: `tugy/recipes-api` image from Task 9.
- Produces: `recipes-api` reachable at `recipes-api.apps.svc.cluster.local:80`; `mongo.apps.svc.cluster.local:27017`; `redis.apps.svc.cluster.local:6379`.

- [ ] **Step 1: Create `k8s/apps/mongo/statefulset.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongo
  namespace: apps
spec:
  serviceName: mongo
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongo
          image: mongo:7
          ports:
            - containerPort: 27017
          volumeMounts:
            - name: data
              mountPath: /data/db
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              memory: 512Mi
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: local-path
        resources:
          requests:
            storage: 5Gi
```

- [ ] **Step 2: Create `k8s/apps/mongo/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongo
  namespace: apps
spec:
  selector:
    app: mongo
  ports:
    - port: 27017
      targetPort: 27017
  clusterIP: None
```

- [ ] **Step 3: Create `k8s/apps/mongo/network-policy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mongo
  namespace: apps
spec:
  podSelector:
    matchLabels:
      app: mongo
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: recipes-api
      ports:
        - port: 27017
          protocol: TCP
```

- [ ] **Step 4: Create `k8s/apps/redis/statefulset.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: apps
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: data
              mountPath: /data
          resources:
            requests:
              cpu: 10m
              memory: 32Mi
            limits:
              memory: 128Mi
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: local-path
        resources:
          requests:
            storage: 512Mi
```

- [ ] **Step 5: Create `k8s/apps/redis/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: apps
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
  clusterIP: None
```

- [ ] **Step 6: Create `k8s/apps/redis/network-policy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: redis
  namespace: apps
spec:
  podSelector:
    matchLabels:
      app: redis
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: recipes-api
      ports:
        - port: 6379
          protocol: TCP
```

- [ ] **Step 7: Create `k8s/apps/recipes-api/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recipes-api
  namespace: apps
spec:
  replicas: 1
  selector:
    matchLabels:
      app: recipes-api
  template:
    metadata:
      labels:
        app: recipes-api
    spec:
      containers:
        - name: api
          image: tugy/recipes-api:latest
          ports:
            - containerPort: 80
          env:
            - name: MONGO_URI
              value: mongodb://mongo.apps.svc.cluster.local:27017/recipes
            - name: REDIS_URL
              value: redis://redis.apps.svc.cluster.local:6379
            - name: CLERK_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: recipes-api-clerk
                  key: secretKey
          resources:
            requests:
              cpu: 20m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
```

- [ ] **Step 8: Create `k8s/apps/recipes-api/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: recipes-api
  namespace: apps
spec:
  selector:
    app: recipes-api
  ports:
    - port: 80
      targetPort: 80
```

- [ ] **Step 9: Create `k8s/apps/recipes-api/network-policy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: recipes-api
  namespace: apps
spec:
  podSelector:
    matchLabels:
      app: recipes-api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: recipes
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: mongo
      ports:
        - port: 27017
          protocol: TCP
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - port: 6379
          protocol: TCP
    - ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    - ports:
        - port: 443
          protocol: TCP
```

- [ ] **Step 10: Modify `k8s/apps/recipes/network-policy.yaml`** to allow the frontend's nginx to reach `recipes-api`

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: recipes
  namespace: apps
spec:
  podSelector:
    matchLabels:
      app: recipes
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
  egress:
    - ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
    - to:
        - podSelector:
            matchLabels:
              app: recipes-api
      ports:
        - port: 80
          protocol: TCP
```

- [ ] **Step 11: Create a placeholder `recipes-api-clerk` sealed secret**

No real Clerk application exists yet (creating one requires a human signing into clerk.com and configuring Google OAuth — not something scriptable from here). Seal an obvious placeholder so the manifest applies cleanly; `recipes-api` will crash-loop on auth calls until the real key is swapped in, which is fine since Task 10's network-policy only allows traffic in from `recipes` (nginx), and the frontend isn't switched to call `/api/*` until sub-project 2, so nothing user-facing breaks in the meantime.

```bash
kubectl create secret generic recipes-api-clerk \
  --dry-run=client --from-literal=secretKey=REPLACE_WITH_REAL_CLERK_SECRET_KEY -o yaml \
  | kubeseal --format yaml --namespace apps > k8s/apps/recipes-api/sealed-secret.yaml
```

Add `metadata.name: recipes-api-clerk` / `metadata.namespace: apps` under `spec.template` in the generated file if `kubeseal` didn't include them (compare against `k8s/apps/tech/sealed-secret.yaml`'s shape for reference).

- [ ] **Step 12: Create `.github/workflows/deploy-recipes.yaml`** (multi-component dispatch, mirrors `deploy-adifinki.yaml`)

```yaml
name: Deploy recipes

on:
  workflow_dispatch:
    inputs:
      recipes_image:
        required: true
      recipes_api_image:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Update image tags
        run: |
          sed -i "s|image: tugy/recipes:.*|image: ${{ github.event.inputs.recipes_image }}|" k8s/apps/recipes/deployment.yaml
          sed -i "s|image: tugy/recipes-api:.*|image: ${{ github.event.inputs.recipes_api_image }}|" k8s/apps/recipes-api/deployment.yaml

      - name: Commit updated manifests
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add k8s/apps/recipes/deployment.yaml k8s/apps/recipes-api/deployment.yaml
          git diff --cached --quiet || git commit -m "deploy: bump recipes to ${{ github.sha }}"
          git push

      - name: Connect Tailscale
        uses: tailscale/github-action@v2
        with:
          oauth-client-id: ${{ secrets.TS_OAUTH_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}
          tags: tag:ci

      - name: Apply manifests
        env:
          KUBECONFIG_DATA: ${{ secrets.KUBECONFIG_REMOTE }}
        run: |
          echo "$KUBECONFIG_DATA" | base64 -d > /tmp/kubeconfig.yaml
          chmod 600 /tmp/kubeconfig.yaml
          KUBECONFIG=/tmp/kubeconfig.yaml kubectl apply -f k8s/apps/mongo/
          KUBECONFIG=/tmp/kubeconfig.yaml kubectl apply -f k8s/apps/redis/
          KUBECONFIG=/tmp/kubeconfig.yaml kubectl apply -f k8s/apps/recipes-api/
          KUBECONFIG=/tmp/kubeconfig.yaml kubectl apply -f k8s/apps/recipes/
          KUBECONFIG=/tmp/kubeconfig.yaml kubectl rollout status deployment/recipes -n apps --timeout=120s
          KUBECONFIG=/tmp/kubeconfig.yaml kubectl rollout status deployment/recipes-api -n apps --timeout=120s
```

- [ ] **Step 13: Commit, push, and apply**

```bash
cd ~/git/server
git add k8s/apps/mongo k8s/apps/redis k8s/apps/recipes-api k8s/apps/recipes/network-policy.yaml .github/workflows/deploy-recipes.yaml
git commit -m "feat: add mongo, redis, and recipes-api manifests + multi-component deploy workflow"
git push origin main
```

This lands the manifests on `main` but does not apply them yet — actual cluster application happens when Task 9's CI run on the `recipes` repo dispatches `deploy-recipes.yaml` with real image tags after this task's changes are merged and Task 9 is pushed.
