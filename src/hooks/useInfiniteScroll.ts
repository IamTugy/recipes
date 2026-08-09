import { useCallback, useEffect, useRef } from 'react'

// Attach the returned ref to a sentinel element at the end of a list;
// `onIntersect` fires each time it scrolls into view.
export function useInfiniteScroll(onIntersect: () => void) {
  const onIntersectRef = useRef(onIntersect)
  useEffect(() => {
    onIntersectRef.current = onIntersect
  }, [onIntersect])

  const observerRef = useRef<IntersectionObserver | null>(null)
  function getObserver() {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(entries => {
        if (entries[0]?.isIntersecting) onIntersectRef.current()
      }, { rootMargin: '400px' })
    }
    return observerRef.current
  }

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    const observer = getObserver()
    observer.disconnect()
    if (node) observer.observe(node)
  }, [])

  return sentinelRef
}
