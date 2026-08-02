// Lightweight cross-component notification for "a recipe's status changed"
// (submitted, cancelled, approved, rejected) - lets independent hook
// instances (e.g. the Nav attention badge and My Recipes / the review
// queue) refresh themselves without needing shared/global state.
const EVENT_NAME = 'recipes:status-changed'

export function notifyRecipeStatusChanged(): void {
  window.dispatchEvent(new Event(EVENT_NAME))
}

export function onRecipeStatusChanged(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback)
  return () => window.removeEventListener(EVENT_NAME, callback)
}
