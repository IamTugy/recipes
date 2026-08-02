import { test } from 'node:test'
import assert from 'node:assert/strict'
import RedisMock from 'ioredis-mock'
import { createOAuthStore } from './oauthStore.js'

test('registerClient produces a client that getClient can look up', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  const { clientId, clientSecret } = await store.registerClient({ redirectUris: ['https://example.com/cb'] })
  assert.ok(clientId.length > 0)
  assert.ok(clientSecret.length > 0)

  const client = await store.getClient(clientId)
  assert.deepEqual(client?.redirectUris, ['https://example.com/cb'])
  assert.equal(client?.clientSecret, clientSecret)
})

test('getClient returns null for an unknown client id', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  assert.equal(await store.getClient('nope'), null)
})

test('pending authorization can be taken exactly once', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  await store.storePendingAuthorization('state1', {
    clientId: 'c1', redirectUri: 'https://example.com/cb', codeChallenge: 'challenge', clientState: 'orig-state',
  })

  const first = await store.takePendingAuthorization('state1')
  assert.deepEqual(first, { clientId: 'c1', redirectUri: 'https://example.com/cb', codeChallenge: 'challenge', clientState: 'orig-state' })

  const second = await store.takePendingAuthorization('state1')
  assert.equal(second, null)
})

test('auth code can be taken exactly once', async () => {
  const store = createOAuthStore(new RedisMock() as any)
  await store.storeAuthCode('code1', {
    clerkAccessToken: 'tok', codeChallenge: 'challenge', redirectUri: 'https://example.com/cb', clientId: 'c1',
  })

  const first = await store.takeAuthCode('code1')
  assert.deepEqual(first, { clerkAccessToken: 'tok', codeChallenge: 'challenge', redirectUri: 'https://example.com/cb', clientId: 'c1' })

  const second = await store.takeAuthCode('code1')
  assert.equal(second, null)
})
