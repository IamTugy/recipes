import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { ApiError } from '../lib/api'
import type { ReportReason } from '../types'

export function useReport() {
  const { getToken } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  async function submit(recipeId: string, reason: ReportReason, message?: string): Promise<void> {
    setSubmitting(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/recipes/${recipeId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason, message: message || undefined }),
      })
      if (!res.ok) throw new ApiError(res.status, 'Failed to report recipe')
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting }
}
