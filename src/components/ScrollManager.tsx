import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// SPA route changes don't trigger the browser's own scroll handling - a
// pushState-based navigation keeps whatever scrollY the previous page had,
// which hides the new page's heading/search/filters when it opens mid-scroll.
// Reset to top on PUSH/REPLACE (Home, sidebar links, "Go to recipe", etc.).
// POP (Back/Forward) is left untouched so the browser's native history scroll
// restoration can put the user back where they were.
export default function ScrollManager() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const prevPathname = useRef(pathname)

  useLayoutEffect(() => {
    if (pathname === prevPathname.current) return
    prevPathname.current = pathname
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navigationType])

  return null
}
