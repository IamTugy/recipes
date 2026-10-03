import { ApiError } from './api'

// Mirrors api/src/cook-together/cook-together.types.ts (the server owns the
// plan and the estimates - the client only renders and sends actions).

export type CookTogetherStatus = 'lobby' | 'cooking' | 'finished'
export type CookTogetherTaskStatus = 'pending' | 'in_progress' | 'done'

export interface CookTogetherParticipant {
  userId: string
  name?: string
  imageUrl?: string
  joinedAt: string
}

export interface CookTogetherTask {
  id: string
  stepNum: number
  instruction: string
  instructionEn?: string
  activeMinutes: number
  waitMinutes: number
  estimatedMinutes: number
  dependsOn: string[]
  assigneeId: string | null
  status: CookTogetherTaskStatus
  startedAt?: string
  completedAt?: string
  completedBy?: string
}

export interface CookTogetherParticipantProgress {
  userId: string
  doneTasks: number
  totalTasks: number
  remainingMinutes: number
  currentTaskIds: string[]
}

export interface CookTogetherProgress {
  totalTasks: number
  doneTasks: number
  percent: number
  remainingMinutes: number
  etaAt: string | null
  speedFactor: number
  perParticipant: CookTogetherParticipantProgress[]
  taskEtaAt: Record<string, string>
}

export interface CookTogetherRoom {
  code: string
  recipeId: string
  recipeTitle: string
  recipeTitleHe?: string
  hostId: string
  status: CookTogetherStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  participants: CookTogetherParticipant[]
  tasks: CookTogetherTask[]
  planSource: 'ai' | 'fallback' | null
  progress: CookTogetherProgress
  viewerId: string
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  getToken: () => Promise<string | null>,
  body?: unknown,
): Promise<T> {
  const token = await getToken()
  const res = await fetch(`/api/cook-together${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let message = `Request to /cook-together${path} failed with ${res.status}`
    try {
      const data = await res.json() as { message?: string }
      if (typeof data.message === 'string') message = data.message
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, message)
  }
  // A null body (getCurrent with no room) comes back as an empty response.
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

type GetToken = () => Promise<string | null>

const taskPath = (code: string, taskId: string, action: string) =>
  `/${encodeURIComponent(code)}/tasks/${encodeURIComponent(taskId)}/${action}`

export const cookTogetherApi = {
  current: (getToken: GetToken) => request<CookTogetherRoom | null>('GET', '/current', getToken),
  get: (code: string, getToken: GetToken) => request<CookTogetherRoom>('GET', `/${encodeURIComponent(code)}`, getToken),
  create: (recipeId: string, getToken: GetToken) => request<CookTogetherRoom>('POST', '', getToken, { recipeId }),
  join: (code: string, getToken: GetToken) => request<CookTogetherRoom>('POST', `/${encodeURIComponent(code)}/join`, getToken),
  leave: (code: string, getToken: GetToken) => request<{ ok: true }>('POST', `/${encodeURIComponent(code)}/leave`, getToken),
  start: (code: string, getToken: GetToken) => request<CookTogetherRoom>('POST', `/${encodeURIComponent(code)}/start`, getToken),
  resplit: (code: string, getToken: GetToken) => request<CookTogetherRoom>('POST', `/${encodeURIComponent(code)}/resplit`, getToken),
  finish: (code: string, getToken: GetToken) => request<CookTogetherRoom>('POST', `/${encodeURIComponent(code)}/finish`, getToken),
  cancel: (code: string, getToken: GetToken) => request<{ ok: true }>('DELETE', `/${encodeURIComponent(code)}`, getToken),
  claimTask: (code: string, taskId: string, getToken: GetToken) => request<CookTogetherRoom>('POST', taskPath(code, taskId, 'claim'), getToken),
  startTask: (code: string, taskId: string, getToken: GetToken) => request<CookTogetherRoom>('POST', taskPath(code, taskId, 'start'), getToken),
  completeTask: (code: string, taskId: string, getToken: GetToken) => request<CookTogetherRoom>('POST', taskPath(code, taskId, 'complete'), getToken),
  reopenTask: (code: string, taskId: string, getToken: GetToken) => request<CookTogetherRoom>('POST', taskPath(code, taskId, 'reopen'), getToken),
}

export function cookTogetherJoinUrl(code: string): string {
  return `${window.location.origin}/?cook=${encodeURIComponent(code)}`
}

// Pulls a join code out of a ?cook=CODE query string (share link / launch
// target), or null if there isn't one.
export function joinCodeFromSearch(search: string): string | null {
  const code = new URLSearchParams(search).get('cook')?.trim().toUpperCase()
  return code && /^[A-Z0-9]{6}$/.test(code) ? code : null
}
