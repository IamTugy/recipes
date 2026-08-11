import { useRef } from 'react'
import { useAuth } from '@clerk/react'
import { usePolling } from '../hooks/usePolling'
import { fetchActiveJobs, fetchJobs } from '../lib/jobs'
import { toastManager } from '../context/toastContextObject'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'

const POLL_INTERVAL_MS = 3000

// Global, mounted once outside the page-routed tree (see main.tsx) so job
// progress survives navigation - a toast started while importing a recipe
// keeps updating even if the user has already moved to another page. Also
// gives cross-device sync for free: any tab polling GET /jobs?status=active
// picks up a job in progress regardless of which device started it.
export default function JobsWatcher() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { lang } = useLanguage()
  const tx = t[lang]
  const toastIdByJobId = useRef(new Map<string, string>())

  async function poll() {
    let active
    try {
      active = await fetchActiveJobs(getToken)
    } catch {
      return
    }
    const activeIds = new Set(active.map(job => job.id))

    for (const job of active) {
      if (toastIdByJobId.current.has(job.id)) continue
      const toastId = toastManager.add({
        description: job.label ? `${tx.jobInProgress}: ${job.label}` : tx.jobInProgress,
        type: 'info',
        timeout: 0,
      })
      toastIdByJobId.current.set(job.id, toastId)
    }

    // A job this tab was showing as active that's no longer in the active
    // list just finished - fetch its final state and flip the sticky
    // progress toast into a normal auto-dismissing result toast. A job that
    // finishes between polls without ever appearing here (started and
    // finished within one 3s window, or already done on first poll from
    // another device) is intentionally not toasted retroactively - it just
    // shows up on the /jobs page.
    const finishedJobIds = [...toastIdByJobId.current.keys()].filter(id => !activeIds.has(id))
    if (finishedJobIds.length === 0) return

    let all
    try {
      all = await fetchJobs(getToken)
    } catch {
      return
    }
    for (const jobId of finishedJobIds) {
      const toastId = toastIdByJobId.current.get(jobId)
      toastIdByJobId.current.delete(jobId)
      if (!toastId) continue
      const job = all.find(j => j.id === jobId)
      if (!job) continue
      if (job.status === 'done') {
        const href = job.resultRecipeIds.length === 1 ? `/recipes/${job.resultRecipeIds[0]}/edit` : '/my-recipes'
        toastManager.update(toastId, {
          description: job.resultRecipeIds.length === 1 ? tx.jobDoneSingle : tx.jobDoneBatch(job.resultRecipeIds.length),
          type: 'success',
          timeout: 5000,
          data: { href },
        })
      } else if (job.status === 'failed') {
        toastManager.update(toastId, {
          description: job.error ?? tx.jobFailed,
          type: 'error',
          timeout: 5000,
        })
      }
    }
  }

  usePolling(poll, POLL_INTERVAL_MS, isLoaded && isSignedIn)
  return null
}
