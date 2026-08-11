import { useAuth } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'
import { useLeaderboard, useMyPoints } from '../hooks/useRanking'
import { t } from "../i18n";

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function LeaderboardPage() {
  const { lang } = useLanguage()
        const tx = t[lang]
  const { userId } = useAuth()
  const { entries, loading } = useLeaderboard(20)
  const myPoints = useMyPoints()

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-2">
          {tx.leaderboard}
        </h1>
        <p className="text-sm text-cream/40 mb-6">
          {tx.earnPointsForUsingTheApp}
        </p>

        {myPoints !== null && (
          <div className="card p-4 mb-6 flex items-center justify-between">
            <span className="text-sm text-cream/60">{tx.myPoints}</span>
            <span className="font-serif text-xl font-bold text-amber">{myPoints}</span>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-cream/40">{tx.loading2}</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-cream/40">
            {tx.noRankedActivityYet}
          </div>
        ) : (
          <ol className="card divide-y divide-tint/[0.06]">
            {entries.map(entry => (
              <li
                key={entry.userId}
                className={`flex items-center gap-3 px-4 py-3 ${entry.userId === userId ? 'bg-amber/[0.06]' : ''}`}
              >
                <span className="w-7 shrink-0 text-center text-sm text-cream/40">
                  {RANK_MEDAL[entry.rank] ?? entry.rank}
                </span>
                <span className="flex-1 truncate text-sm text-cream/80">
                  {entry.name ?? (tx.aCook)}
                </span>
                <span className="font-serif text-sm font-semibold text-amber">{entry.points}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
