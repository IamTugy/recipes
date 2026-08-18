export async function translateText(
  text: string,
  targetLang: 'he' | 'en',
  getToken: () => Promise<string | null>
): Promise<string> {
  const trimmed = text.trim().slice(0, 5000)
  if (!trimmed) return ''
  try {
    const token = await getToken()
    const res = await fetch('/api/translations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: trimmed, targetLang }),
    })
    if (!res.ok) return ''
    const data: { translated?: string } = await res.json()
    const translated = data.translated ?? ''
    // The backend falls back to returning the original text untranslated
    // if the translation call itself failed - treat that as a failure
    // rather than filling the field with the wrong language.
    return translated === trimmed ? '' : translated
  } catch {
    return ''
  }
}
