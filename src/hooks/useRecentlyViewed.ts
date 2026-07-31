import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'recently-viewed'
const MAX_ITEMS = 8

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch { /* localStorage unavailable */ }
}

export function useRecentlyViewed() {
  const [recentIds, setRecentIds] = useState<string[]>(load)

  useEffect(() => {
    save(recentIds)
  }, [recentIds])

  const addRecent = useCallback((id: string) => {
    setRecentIds(prev => [id, ...prev.filter(existing => existing !== id)].slice(0, MAX_ITEMS))
  }, [])

  return { recentIds, addRecent }
}
