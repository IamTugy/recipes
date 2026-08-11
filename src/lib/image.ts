const R2_PUBLIC_URL = 'https://recipes-assets.tugy.dev'

// Must match ALLOWED_WIDTHS in api/src/share/share-image.service.ts - the
// resize endpoint whitelists widths rather than accepting any number, so an
// unlisted value here would silently fall back to the full 1200px image.
export type ImageWidth = 160 | 320 | 640 | 1200

// Recipe photos are uploaded at full camera resolution (multi-MB, thousands
// of pixels wide) - a 48px list thumbnail downloading that same original
// wastes far more relative to its own display size than a full-width hero
// does. Routes our own hosted photos through the resize/cache proxy at the
// exact width the caller needs; anything else (a seed recipe's static asset,
// an already-small image, or no image at all) passes through unchanged since
// the backend can only resize images it's allowed to fetch.
export function resizedImage(url: string | null | undefined, width: ImageWidth): string | undefined {
  if (!url || !url.startsWith(`${R2_PUBLIC_URL}/`)) return url ?? undefined
  return `/api/share/image?src=${encodeURIComponent(url)}&w=${width}`
}
