import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../lib/api'

export function useNote(slug: string | undefined) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !slug) return
    let cancelled = false

    apiFetch<{ text: string | null }>(`/notes/${slug}`, getToken)
      .then(data => {
        if (!cancelled) setText(data.text ?? '')
      })
      .catch(() => { /* no note yet, or failed to load - not fatal */ })

    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, slug, getToken])

  async function save(newText: string) {
    setText(newText)
    if (!slug) return
    setStatus('saving')
    const token = await getToken()
    const res = await fetch(`/api/notes/${slug}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: newText }),
    })
    setStatus(res.ok ? 'saved' : 'idle')
    if (res.ok) setTimeout(() => setStatus('idle'), 1500)
  }

  return { text, save, status }
}
