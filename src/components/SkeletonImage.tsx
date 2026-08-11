import { useState } from 'react'

interface SkeletonImageProps {
  src: string | undefined
  alt: string
  className: string
  onClick?: () => void
  loading?: 'lazy' | 'eager'
  fetchPriority?: 'high' | 'low' | 'auto'
}

// A plain <img> shows nothing until it's fully decoded, then pops in at full
// opacity - jarring on a slow connection, especially in a grid where several
// images resolve at different times. This crossfades a pulsing skeleton
// block into the image instead. Requires a positioned (relative) ancestor,
// same as every existing image container in this app.
export default function SkeletonImage({ src, alt, className, onClick, loading, fetchPriority }: SkeletonImageProps) {
  const [loaded, setLoaded] = useState(false)
  // React reuses this component instance across list re-renders (e.g. a
  // filter/sort changing which recipe lands at a given grid position)
  // rather than remounting it - without this, `loaded` would stay true from
  // the previous src and the new image would show at full opacity (blank,
  // since it hasn't actually loaded yet) instead of behind the skeleton.
  // Adjusting state during render (not in an effect) avoids an extra
  // render where the stale image would flash before resetting.
  const [trackedSrc, setTrackedSrc] = useState(src)
  if (src !== trackedSrc) {
    setTrackedSrc(src)
    setLoaded(false)
  }

  if (!src) return null

  return (
    <>
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-tint/[0.06] animate-pulse transition-opacity duration-300 ${loaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      />
      <img
        src={src}
        alt={alt}
        onClick={onClick}
        loading={loading}
        fetchPriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  )
}
