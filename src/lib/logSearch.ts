// Best-effort analytics call - search is entirely client-side (Home.tsx
// filters an already-fetched recipe list), so this is the only place a
// "search was performed" event reaches the backend. Failures are silently
// ignored; a missed log entry should never affect the search UX itself.
export async function logSearch(
  query: string,
  resultsCount: number,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const token = await getToken()
    await fetch('/api/activity/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, resultsCount }),
    })
  } catch {
    /* best-effort - ignore */
  }
}
