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
