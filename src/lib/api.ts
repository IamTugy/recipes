export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(
  path: string,
  getToken: () => Promise<string | null>
): Promise<T> {
  const token = await getToken()
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    throw new ApiError(res.status, `Request to ${path} failed with ${res.status}`)
  }

  return res.json() as Promise<T>
}
