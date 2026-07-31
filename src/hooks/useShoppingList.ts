import { useCallback, useEffect, useState } from 'react'

export interface ShoppingListItem {
  id: string
  name: string
  amount: string
  recipeTitle: string
  checked: boolean
}

const STORAGE_KEY = 'shopping-list'
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

  useEffect(() => {
    save(items)
  }, [items])

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
    setItems([])
  }, [])

  const clearChecked = useCallback(() => {
    setItems(prev => prev.filter(item => !item.checked))
  }, [])

  return { items, addItems, toggle, remove, clear, clearChecked }
}
