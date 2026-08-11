// Feature requests are plain-text GitHub issue bodies with no dedicated image
// field, so an attached photo is embedded as a trailing markdown image line
// and pulled back out for display - keeps the backend/GitHub schema untouched.
const IMAGE_LINE_PATTERN = /\n\n!\[screenshot\]\((\S+)\)\s*$/

export function embedFeatureRequestImage(description: string, imageUrl: string | null | undefined): string {
  if (!imageUrl) return description
  return `${description}\n\n![screenshot](${imageUrl})`
}

export function extractFeatureRequestImage(body: string): { text: string, imageUrl: string | null } {
  const match = body.match(IMAGE_LINE_PATTERN)
  if (!match) return { text: body, imageUrl: null }
  return { text: body.slice(0, match.index), imageUrl: match[1] }
}
