import { useEffect, useState } from 'react'

// Matches the app's `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` pattern
// (Tailwind defaults: sm=640px, lg=1024px).
export function useGridColumns(): number {
  const [columns, setColumns] = useState(() => computeColumns())

  useEffect(() => {
    const sm = window.matchMedia('(min-width: 640px)')
    const lg = window.matchMedia('(min-width: 1024px)')
    const update = () => setColumns(computeColumns())
    sm.addEventListener('change', update)
    lg.addEventListener('change', update)
    return () => {
      sm.removeEventListener('change', update)
      lg.removeEventListener('change', update)
    }
  }, [])

  return columns
}

function computeColumns(): number {
  if (typeof window === 'undefined') return 1
  if (window.matchMedia('(min-width: 1024px)').matches) return 3
  if (window.matchMedia('(min-width: 640px)').matches) return 2
  return 1
}
