import { Link } from 'react-router-dom'
import { useJobs } from '../hooks/useJobs'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'
import type { Job } from '../types'

const STATUS_LABEL_KEY: Record<Job['status'], 'jobStatusQueued' | 'jobStatusRunning' | 'jobStatusDone' | 'jobStatusFailed'> = {
  queued: 'jobStatusQueued',
  running: 'jobStatusRunning',
  done: 'jobStatusDone',
  failed: 'jobStatusFailed',
}

const STATUS_CLASS: Record<Job['status'], string> = {
  queued: 'bg-tint/10 text-cream/50',
  running: 'bg-amber/10 text-amber',
  done: 'bg-herb/10 text-herb',
  failed: 'bg-red-500/10 text-red-400',
}

export default function JobsPage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const { jobs, loading } = useJobs()

  return (
    <div className="max-w-2xl mx-auto">
      {loading ? (
        <p className="text-cream/30 text-sm">{tx.loading}</p>
      ) : jobs.length === 0 ? (
        <p className="text-cream/30 text-sm">{tx.noJobsYet}</p>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className="card p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-sm text-cream/80 truncate">{job.label ?? job.type}</p>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[job.status]}`}>
                  {tx[STATUS_LABEL_KEY[job.status]]}
                </span>
              </div>
              <p className="text-[11px] text-cream/30 mb-2">
                {new Date(job.createdAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
              </p>
              {job.status === 'done' && job.resultRecipeIds.length > 0 && (
                <Link
                  to={job.resultRecipeIds.length === 1 ? `/recipes/${job.resultRecipeIds[0]}/edit` : '/my-recipes'}
                  className="text-xs text-amber hover:text-amber/80 transition-colors"
                >
                  {job.resultRecipeIds.length === 1 ? tx.viewResult : tx.jobDoneBatch(job.resultRecipeIds.length)}
                </Link>
              )}
              {job.status === 'failed' && job.error && (
                <p className="text-xs text-red-400/80">{job.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
