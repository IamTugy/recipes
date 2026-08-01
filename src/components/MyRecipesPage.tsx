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

export default function MyRecipesPage() {
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const { recipes, loading } = useMyRecipes()

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {lang === 'he' ? 'המתכונים שלי' : 'My Recipes'}
        </h1>

        {loading ? (
          <p className="text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'עדיין לא יצרתם מתכונים' : "You haven't created any recipes yet"}
          </p>
        ) : (
          <div className="space-y-3">
            {recipes.map(r => {
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
