import { apiFetch } from './api'
import type { Job } from '../types'

export function fetchJobs(getToken: () => Promise<string | null>): Promise<Job[]> {
  return apiFetch<Job[]>('/jobs', getToken)
}

export function fetchActiveJobs(getToken: () => Promise<string | null>): Promise<Job[]> {
  return apiFetch<Job[]>('/jobs?status=active', getToken)
}
