import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useCookHistory } from '../hooks/useCookHistory'
import { useLanguage } from '../hooks/useLanguage'
import { formatTime } from '../utils/format'
import { t } from '../i18n'

export default function CookHistoryPage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const { stats, entries, loading } = useCookHistory()

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {tx.cookHistory}
        </h1>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : entries.length === 0 ? (
          <p className="text-cream/30 text-sm">{tx.noCookHistoryYet}</p>
        ) : (
          <div className="space-y-6">
            {stats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <div className="text-2xl font-bold text-amber">{stats.totalRecipesCooked}</div>
                  <div className="text-xs text-cream/40 mt-1">{tx.recipesCooked}</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-2xl font-bold text-amber">{stats.totalCooks}</div>
                  <div className="text-xs text-cream/40 mt-1">{tx.timesCooked2}</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-2xl font-bold text-amber">{formatTime(Math.round(stats.totalTimeSpentSeconds / 60))}</div>
                  <div className="text-xs text-cream/40 mt-1">{tx.totalTimeCooking}</div>
                </div>
              </div>
            )}

            {stats && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-cream/70 mb-3">{tx.cooksPerMonth}</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.cooksByMonth}>
                    <XAxis dataKey="month" stroke="#cream" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke="#cream" fontSize={10} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={{ background: '#1a1a1a', border: 'none', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {stats && stats.mostCooked.length > 0 && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-cream/70 mb-3">{tx.mostCookedRecipes}</h2>
                <ul className="space-y-2">
                  {stats.mostCooked.map(r => (
                    <li key={r.recipeId}>
                      <Link to={`/cook-history/${r.recipeId}`} className="flex items-center justify-between text-sm text-cream/80 hover:text-cream transition-colors">
                        <span>{r.recipeTitle}</span>
                        <span className="text-cream/40">{tx.timesCooked(r.count)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              {entries.map((entry, i) => (
                <Link
                  key={`${entry.recipeId}-${entry.finishedAt}-${i}`}
                  to={`/cook-history/${entry.recipeId}`}
                  className="card p-3 flex items-center justify-between text-sm hover:bg-tint/[0.03] transition-colors"
                >
                  <span className="text-cream/80">{entry.recipeTitle}</span>
                  <span className="text-cream/40 text-xs">
                    {new Date(entry.finishedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')} · {formatTime(Math.round(entry.totalDurationSeconds / 60))}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
