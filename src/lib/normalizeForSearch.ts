// Strips diacritics so search matches regardless of accents, e.g. "Pao"
// matches "Pão" and "resume" matches "résumé".
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
