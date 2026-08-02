import { randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'

interface ClientRecord {
  redirectUris: string[]
  clientSecret: string
}

interface PendingAuthorization {
  clientId: string
  redirectUri: string
  codeChallenge: string
  clientState: string
}

interface AuthCodeRecord {
  clerkAccessToken: string
  codeChallenge: string
  redirectUri: string
  clientId: string
}

const PENDING_AUTHORIZATION_TTL_SECONDS = 10 * 60
const AUTH_CODE_TTL_SECONDS = 2 * 60

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

export function createOAuthStore(redis: Redis) {
  return {
    async registerClient(metadata: { redirectUris: string[]; clientName?: string }) {
      const clientId = randomToken(16)
      const clientSecret = randomToken(32)
      const record: ClientRecord = { redirectUris: metadata.redirectUris, clientSecret }
      await redis.set(`oauth:client:${clientId}`, JSON.stringify(record))
      return { clientId, clientSecret }
    },

    async getClient(clientId: string): Promise<ClientRecord | null> {
      const raw = await redis.get(`oauth:client:${clientId}`)
      return raw ? (JSON.parse(raw) as ClientRecord) : null
    },

    async storePendingAuthorization(state: string, data: PendingAuthorization): Promise<void> {
      await redis.set(`oauth:pending:${state}`, JSON.stringify(data), 'EX', PENDING_AUTHORIZATION_TTL_SECONDS)
    },

    async takePendingAuthorization(state: string): Promise<PendingAuthorization | null> {
      const key = `oauth:pending:${state}`
      const raw = await redis.get(key)
      if (!raw) return null
      await redis.del(key)
      return JSON.parse(raw) as PendingAuthorization
    },

    async storeAuthCode(code: string, data: AuthCodeRecord): Promise<void> {
      await redis.set(`oauth:code:${code}`, JSON.stringify(data), 'EX', AUTH_CODE_TTL_SECONDS)
    },

    async takeAuthCode(code: string): Promise<AuthCodeRecord | null> {
      const key = `oauth:code:${code}`
      const raw = await redis.get(key)
      if (!raw) return null
      await redis.del(key)
      return JSON.parse(raw) as AuthCodeRecord
    },
  }
}
