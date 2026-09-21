import { Test } from '@nestjs/testing'
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CookTogetherService } from './cook-together.service'
import { CookTogetherPlanner } from './cook-together-planner.service'
import { RedisService } from '../redis/redis.service'
import { RecipesService } from '../recipes/recipes.service'
import { UsersService } from '../users/users.service'
import { CookLogService } from '../cook-log/cook-log.service'
import { buildTasks } from './cook-together.plan'
import { assignPending } from './cook-together.schedule'
import { CookTogetherTask } from './cook-together.types'

// Minimal in-memory stand-in for the ioredis calls the service makes.
class FakeRedis {
  store = new Map<string, string>()
  get = jest.fn(async (key: string) => this.store.get(key) ?? null)
  set = jest.fn(async (key: string, value: string, ...args: (string | number)[]) => {
    if (args.includes('NX') && this.store.has(key)) return null
    this.store.set(key, value)
    return 'OK'
  })
  del = jest.fn(async (key: string) => (this.store.delete(key) ? 1 : 0))
  expire = jest.fn(async () => 1)
  eval = jest.fn(async (_script: string, _n: number, key: string, token: string) => {
    if (this.store.get(key) === token) { this.store.delete(key); return 1 }
    return 0
  })
}

const recipe = {
  id: 'recipe_1',
  title: 'Lasagna',
  titleHe: 'לזניה',
  steps: [
    { items: [{ instruction: 'Make ragu' }, { instruction: 'Simmer ragu', timerMinutes: 30 }] },
    { items: [{ instruction: 'Make bechamel' }] },
    { items: [{ instruction: 'Assemble', timerMinutes: 40 }] },
  ],
}

describe('CookTogetherService', () => {
  const redis = new FakeRedis()
  const findByIdForUser = jest.fn()
  const profilesByIds = jest.fn()
  const recordCook = jest.fn()
  const plan = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    redis.store.clear()
    findByIdForUser.mockResolvedValue(recipe)
    profilesByIds.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, { name: `Name ${id}` }])))
    recordCook.mockResolvedValue(undefined)
    plan.mockImplementation(async (_title: string, tasks: CookTogetherTask[], ids: string[]) => {
      const draft = tasks.map(t => ({ ...t, dependsOn: [...t.dependsOn] }))
      assignPending(draft, ids, Date.now())
      return { tasks: draft, source: 'ai' }
    })
  })

  async function makeService() {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CookTogetherService,
        { provide: RedisService, useValue: { getClient: () => redis } },
        { provide: RecipesService, useValue: { findByIdForUser } },
        { provide: UsersService, useValue: { profilesByIds } },
        { provide: CookLogService, useValue: { recordCook } },
        { provide: CookTogetherPlanner, useValue: { plan } },
      ],
    }).compile()
    return moduleRef.get(CookTogetherService)
  }

  async function startedRoom(service: CookTogetherService) {
    const created = await service.create('host', 'recipe_1')
    await service.join(created.code, 'guest')
    const view = await service.start(created.code, 'host')
    return view
  }

  describe('create', () => {
    it('opens a lobby room with the creator as host and stores a join code pointer', async () => {
      const service = await makeService()
      const view = await service.create('host', 'recipe_1')
      expect(view.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
      expect(view).toMatchObject({
        status: 'lobby', hostId: 'host', recipeTitle: 'Lasagna', viewerId: 'host',
        participants: [{ userId: 'host', name: 'Name host' }],
      })
      expect(view.tasks).toHaveLength(4)
      expect(view.tasks[1]).toMatchObject({ id: '0-1', estimatedMinutes: view.tasks[1].activeMinutes + 30 })
      expect(await service.getCurrent('host')).toMatchObject({ code: view.code })
    })

    it('rejects an unknown recipe and a recipe without steps', async () => {
      const service = await makeService()
      findByIdForUser.mockResolvedValueOnce(null)
      await expect(service.create('host', 'nope')).rejects.toThrow(NotFoundException)
      findByIdForUser.mockResolvedValueOnce({ ...recipe, steps: [] })
      await expect(service.create('host', 'recipe_1')).rejects.toThrow(BadRequestException)
    })

    it('moves the user out of a room they were already in', async () => {
      const service = await makeService()
      const first = await service.create('host', 'recipe_1')
      await service.join(first.code, 'guest')
      const second = await service.create('guest', 'recipe_1')
      const old = await service.getRoom(first.code, 'host')
      expect(old.participants.map(p => p.userId)).toEqual(['host'])
      expect((await service.getCurrent('guest'))?.code).toBe(second.code)
    })
  })

  describe('join / leave', () => {
    it('lets a second person join by (case-insensitive) code', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      const joined = await service.join(` ${created.code.toLowerCase()} `, 'guest')
      expect(joined.participants.map(p => p.userId)).toEqual(['host', 'guest'])
      expect(joined.viewerId).toBe('guest')
    })

    it('rejects a bad code, a missing room, a finished room and a full room', async () => {
      const service = await makeService()
      await expect(service.join('x', 'guest')).rejects.toThrow(NotFoundException)
      await expect(service.join('ABCDEF', 'guest')).rejects.toThrow(NotFoundException)

      const created = await service.create('host', 'recipe_1')
      for (let i = 0; i < 7; i++) await service.join(created.code, `u${i}`)
      await expect(service.join(created.code, 'overflow')).rejects.toThrow(ConflictException)
    })

    it('does not let non-participants read the room', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await expect(service.getRoom(created.code, 'stranger')).rejects.toThrow(ForbiddenException)
    })

    it('hands the host role over when the host leaves, and deletes an empty room', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await service.join(created.code, 'guest')
      await service.leave(created.code, 'host')
      expect((await service.getRoom(created.code, 'guest')).hostId).toBe('guest')
      expect(await service.getCurrent('host')).toBeNull()
      await service.leave(created.code, 'guest')
      await expect(service.getRoom(created.code, 'guest')).rejects.toThrow(NotFoundException)
    })

    it('returns a leaver\'s unfinished tasks to the others, keeping finished ones', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      const guestTask = started.tasks.find(t => t.assigneeId === 'guest')!
      await service.startTask(started.code, 'guest', guestTask.id)
      await service.completeTask(started.code, 'guest', guestTask.id)
      await service.leave(started.code, 'guest')
      const after = await service.getRoom(started.code, 'host')
      expect(after.tasks.find(t => t.id === guestTask.id)).toMatchObject({ status: 'done', assigneeId: 'guest' })
      expect(after.tasks.filter(t => t.status === 'pending').every(t => t.assigneeId === 'host')).toBe(true)
    })

    it('gives someone joining mid-cook a share of the pending work', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await service.start(created.code, 'host')
      const joined = await service.join(created.code, 'late')
      expect(joined.tasks.some(t => t.assigneeId === 'late')).toBe(true)
    })
  })

  describe('start', () => {
    it('is host-only, splits work between everyone and moves to cooking', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await service.join(created.code, 'guest')
      await expect(service.start(created.code, 'guest')).rejects.toThrow(ForbiddenException)

      const view = await service.start(created.code, 'host')
      expect(view.status).toBe('cooking')
      expect(view.planSource).toBe('ai')
      expect(view.startedAt).toBeDefined()
      expect(new Set(view.tasks.map(t => t.assigneeId))).toEqual(new Set(['host', 'guest']))
      expect(view.progress.remainingMinutes).toBeGreaterThan(0)
      expect(view.progress.etaAt).not.toBeNull()
      await expect(service.start(created.code, 'host')).rejects.toThrow(BadRequestException)
    })

    it('drops assignments to people who left while the plan was being made', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await service.join(created.code, 'guest')
      plan.mockImplementationOnce(async (_t: string, tasks: CookTogetherTask[]) => {
        await service.leave(created.code, 'guest')
        return { tasks: tasks.map(t => ({ ...t, assigneeId: 'guest' })), source: 'ai' }
      })
      const view = await service.start(created.code, 'host')
      expect(view.tasks.every(t => t.assigneeId === 'host')).toBe(true)
    })
  })

  describe('tasks', () => {
    it('start marks a task in progress for the starter, completing finishes it', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      const task = started.tasks[0]
      const running = await service.startTask(started.code, 'guest', task.id)
      expect(running.tasks[0]).toMatchObject({ status: 'in_progress', assigneeId: 'guest' })
      await expect(service.startTask(started.code, 'host', task.id)).rejects.toThrow(ConflictException)

      const { view, finished } = await service.completeTask(started.code, 'guest', task.id)
      expect(view.tasks[0]).toMatchObject({ status: 'done', completedBy: 'guest' })
      expect(view.progress.doneTasks).toBe(1)
      expect(finished).toBeUndefined()
    })

    it('only the assignee or the host can complete a task', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      const guestTask = started.tasks.find(t => t.assigneeId === 'guest')!
      const hostTask = started.tasks.find(t => t.assigneeId === 'host')!
      await service.join(started.code, 'third')
      await expect(service.completeTask(started.code, 'third', guestTask.id)).rejects.toThrow(ForbiddenException)
      await expect(service.completeTask(started.code, 'guest', hostTask.id)).rejects.toThrow(ForbiddenException)
      await expect(service.completeTask(started.code, 'host', guestTask.id)).resolves.toBeDefined()
    })

    it('claim reassigns a pending task, reopen undoes a completion', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      const hostTask = started.tasks.find(t => t.assigneeId === 'host')!
      const claimed = await service.claimTask(started.code, 'guest', hostTask.id)
      expect(claimed.tasks.find(t => t.id === hostTask.id)?.assigneeId).toBe('guest')

      await service.completeTask(started.code, 'guest', hostTask.id)
      const reopened = await service.reopenTask(started.code, 'guest', hostTask.id)
      expect(reopened.tasks.find(t => t.id === hostTask.id)).toMatchObject({ status: 'pending' })
      await expect(service.claimTask(started.code, 'guest', 'missing')).rejects.toThrow(NotFoundException)
    })

    it('refuses task actions before the cook has started', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await expect(service.startTask(created.code, 'host', '0-0')).rejects.toThrow(BadRequestException)
    })

    it('finishes the room when the last task is done, crediting everyone once', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      let result = { view: started, finished: undefined as unknown }
      for (const task of started.tasks) {
        result = await service.completeTask(started.code, 'host', task.id) as typeof result
      }
      expect(result.view.status).toBe('finished')
      expect(result.finished).toMatchObject({ participantIds: ['host', 'guest'], recipeId: 'recipe_1' })
      expect(recordCook).toHaveBeenCalledTimes(2)
      expect(recordCook).toHaveBeenCalledWith('guest', 'recipe_1')
      // The finished room stays readable for the summary screen.
      expect((await service.getCurrent('guest'))?.status).toBe('finished')
      await expect(service.join(started.code, 'late')).rejects.toThrow(BadRequestException)
    })

    it('serialises simultaneous completions so none are lost', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      await Promise.all(started.tasks.map(t => service.completeTask(started.code, 'host', t.id)))
      expect((await service.getRoom(started.code, 'host')).progress.doneTasks).toBe(started.tasks.length)
      expect(recordCook).toHaveBeenCalledTimes(2)
    })
  })

  describe('finish / cancel', () => {
    it('lets the host finish early, once', async () => {
      const service = await makeService()
      const started = await startedRoom(service)
      await expect(service.finish(started.code, 'guest')).rejects.toThrow(ForbiddenException)
      const { view, finished } = await service.finish(started.code, 'host')
      expect(view.status).toBe('finished')
      expect(finished?.participantIds).toEqual(['host', 'guest'])
      await expect(service.finish(started.code, 'host')).rejects.toThrow(BadRequestException)
    })

    it('lets only the host cancel, removing the room for everyone', async () => {
      const service = await makeService()
      const created = await service.create('host', 'recipe_1')
      await service.join(created.code, 'guest')
      await expect(service.cancel(created.code, 'guest')).rejects.toThrow(ForbiddenException)
      await service.cancel(created.code, 'host')
      expect(await service.getCurrent('guest')).toBeNull()
      expect(await service.getCurrent('host')).toBeNull()
    })
  })

  it('releases the room lock after every mutation', async () => {
    const service = await makeService()
    const created = await service.create('host', 'recipe_1')
    await service.join(created.code, 'guest')
    await expect(service.join(created.code, 'third')).resolves.toBeDefined()
    expect([...redis.store.keys()].some(k => k.startsWith('cook-together-lock:'))).toBe(false)
  })

  it('buildTasks output is what a fresh room contains', async () => {
    const service = await makeService()
    const view = await service.create('host', 'recipe_1')
    expect(view.tasks.map(t => t.id)).toEqual(buildTasks(recipe.steps).map(t => t.id))
  })
})
