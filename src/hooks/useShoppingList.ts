import { useCallback, useEffect, useRef, useState } from 'react'

export interface ShoppingListItem {
  id: string
  name: string
  amount: string
  recipeTitle: string
  checked: boolean
}

const STORAGE_KEY = 'shopping-list'
const UNDO_WINDOW_MS = 6000
let idCounter = 0

function load(): ShoppingListItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(items: ShoppingListItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch { /* localStorage unavailable */ }
}

export function useShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>(load)
  const [lastCleared, setLastCleared] = useState<ShoppingListItem[] | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    save(items)
  }, [items])

  useEffect(() => () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
  }, [])

  function armUndo(removed: ShoppingListItem[]) {
    if (removed.length === 0) return
    setLastCleared(removed)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    undoTimeoutRef.current = setTimeout(() => setLastCleared(null), UNDO_WINDOW_MS)
  }

  const addItems = useCallback((newItems: { name: string; amount: string }[], recipeTitle: string) => {
    setItems(prev => [
      ...prev,
      ...newItems.map(item => ({
        id: `item-${Date.now()}-${idCounter++}`,
        name: item.name,
        amount: item.amount,
        recipeTitle,
        checked: false,
      })),
    ])
  }, [])

  const toggle = useCallback((id: string) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item)))
  }, [])

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }, [])

  const clear = useCallback(() => {
    setItems(prev => {
      armUndo(prev)
      return []
    })
  }, [])

  const clearChecked = useCallback(() => {
    setItems(prev => {
      armUndo(prev.filter(item => item.checked))
      return prev.filter(item => !item.checked)
    })
  }, [])

  const undoClear = useCallback(() => {
    if (!lastCleared) return
    setItems(prev => [...prev, ...lastCleared])
    setLastCleared(null)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
  }, [lastCleared])

  return { items, addItems, toggle, remove, clear, clearChecked, lastCleared, undoClear }
}
