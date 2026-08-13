import { useEffect } from 'react'

const EDGE_ZONE_PX = 24
const OPEN_THRESHOLD_PX = 60
const MAX_VERTICAL_DRIFT_PX = 50
const MOBILE_BREAKPOINT_PX = 640

/**
 * Mirrors the mobile drawer's edge (left in LTR, right in RTL - see
 * Sidebar.tsx's `lang === 'he'` drawer placement) so the swipe-to-open
 * gesture starts from wherever the drawer will actually slide out from.
 */
export function useEdgeSwipeToOpenSidebar(lang: string, mobileOpen: boolean, setMobileOpen: (open: boolean) => void) {
  useEffect(() => {
    if (mobileOpen) return

    let startX = 0
    let startY = 0
    let tracking = false

    function onTouchStart(e: TouchEvent) {
      if (window.innerWidth >= MOBILE_BREAKPOINT_PX) return
      const touch = e.touches[0]
      if (!touch) return
      const fromLeft = touch.clientX <= EDGE_ZONE_PX
      const fromRight = touch.clientX >= window.innerWidth - EDGE_ZONE_PX
      const startsAtDrawerEdge = lang === 'he' ? fromRight : fromLeft
      if (!startsAtDrawerEdge) return
      startX = touch.clientX
      startY = touch.clientY
      tracking = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking) return
      const touch = e.touches[0]
      if (!touch) return
      const deltaX = touch.clientX - startX
      const deltaY = Math.abs(touch.clientY - startY)
      if (deltaY > MAX_VERTICAL_DRIFT_PX) {
        tracking = false
        return
      }
      const swipedInward = lang === 'he' ? -deltaX >= OPEN_THRESHOLD_PX : deltaX >= OPEN_THRESHOLD_PX
      if (swipedInward) {
        tracking = false
        setMobileOpen(true)
      }
    }

    function onTouchEnd() {
      tracking = false
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [lang, mobileOpen, setMobileOpen])
}
