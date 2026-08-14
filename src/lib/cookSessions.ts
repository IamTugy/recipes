// All four calls are fire-and-forget by design (Phase C spec): a dropped
// network request mid-cook must never block or visibly disrupt cooking.
// CookDock's own client-side stopwatch/step state stays authoritative for
// what the user sees regardless of whether these succeed.

export async function startCookSession(
  recipeId: string,
  getToken: () => Promise<string | null>
): Promise<string | null> {
  try {
    const token = await getToken()
    const res = await fetch(`/api/cook-sessions/${recipeId}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return null
    const data: { sessionId: string } = await res.json()
    return data.sessionId
  } catch {
    return null
  }
}

export async function logCookSessionStep(
  sessionId: string,
  stepKey: string,
  stepNum: number,
  checkedSteps: string[],
  checkedIngredients: string[],
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}/steps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ stepKey, stepNum, checkedSteps, checkedIngredients }),
    })
  } catch {
    // best-effort, never blocks cooking
  }
}

export async function finishCookSession(
  sessionId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}/finish`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // best-effort, never blocks cooking
  }
}

export async function abandonCookSession(
  sessionId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // best-effort, never blocks cooking
  }
}

export interface ActiveCookSession {
  sessionId: string
  currentStepKey: string | null
  currentStepNum: number
  checkedSteps: string[]
  checkedIngredients: string[]
  startedAt: string
}

export async function getActiveCookSession(
  recipeId: string,
  getToken: () => Promise<string | null>
): Promise<ActiveCookSession | null> {
  try {
    const token = await getToken()
    const res = await fetch(`/api/cook-sessions/active/${recipeId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) return null
    return (await res.json()) as ActiveCookSession | null
  } catch {
    return null
  }
}

export async function syncCookSession(
  sessionId: string,
  currentStepKey: string | null,
  currentStepNum: number,
  checkedSteps: string[],
  checkedIngredients: string[],
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch(`/api/cook-sessions/${sessionId}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ currentStepKey, currentStepNum, checkedSteps, checkedIngredients }),
    })
  } catch {
    // best-effort, never blocks cooking
  }
}
