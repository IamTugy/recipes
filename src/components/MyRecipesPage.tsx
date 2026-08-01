import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMyRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'

const statusLabel = {
  draft: { he: 'טיוטה', en: 'Draft' },
  pending_review: { he: 'ממתין לאישור', en: 'Pending review' },
  published: { he: 'פורסם', en: 'Published' },
  rejected: { he: 'נדחה', en: 'Rejected' },
} as const

const statusClass = {
  draft: 'bg-tint/10 text-cream/40',
  pending_review: 'bg-amber/10 text-amber',
  published: 'bg-herb/10 text-herb',
  rejected: 'bg-red-500/10 text-red-400',
} as const

type StatusFilter = 'draft' | 'pending_review' | 'published' | 'rejected'
const STATUS_FILTERS: StatusFilter[] = ['draft', 'pending_review', 'published', 'rejected']

export default function MyRecipesPage() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const { recipes, loading } = useMyRecipes()
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<StatusFilter | null>(null)

  const filtered = useMemo(() => {
    let list = recipes
    if (activeStatus) list = list.filter(r => (r.status ?? 'published') === activeStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        (r.titleHe ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [recipes, search, activeStatus])

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {lang === 'he' ? 'המתכונים שלי' : 'My Recipes'}
        </h1>

        {recipes.length > 0 && (
          <div className="mb-4 space-y-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={lang === 'he' ? 'חיפוש לפי שם...' : 'Search by title...'}
              aria-label={lang === 'he' ? 'חיפוש לפי שם' : 'Search by title'}
              className="input-field w-full"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            />
            <div className="flex gap-1.5 flex-wrap">
              <button type="button"
                onClick={() => setActiveStatus(null)}
                className={`px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                  activeStatus === null
                    ? 'text-amber bg-amber/10 border-amber/20'
                    : 'text-cream/35 hover:text-cream/60 border-tint/10'
                }`}
              >
                {lang === 'he' ? 'הכל' : 'All'}
              </button>
              {STATUS_FILTERS.map(s => (
                <button type="button"
                  key={s}
                  onClick={() => setActiveStatus(s === activeStatus ? null : s)}
                  className={`px-3 py-1.5 text-[11px] tracking-wider font-medium transition-colors rounded-lg border ${
                    activeStatus === s
                      ? 'text-amber bg-amber/10 border-amber/20'
                      : 'text-cream/35 hover:text-cream/60 border-tint/10'
                  }`}
                >
                  {statusLabel[s][lang]}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'עדיין לא יצרתם מתכונים' : "You haven't created any recipes yet"}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'לא נמצאו מתכונים תואמים' : 'No matching recipes'}
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map(r => {
              const status = r.status ?? 'published'
              return (
                <button type="button" key={r.id}
                  onClick={() => navigate(`/recipe/${r.id}`)}
                  className="card p-4 w-full text-start flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <h2 className="font-serif text-base font-medium text-cream truncate">{r.title}</h2>
                    {status === 'rejected' && r.reviewComment && (
                      <p className="text-xs text-red-400/80 truncate mt-0.5">{r.reviewComment}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass[status]}`}>
                    {statusLabel[status][lang]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
