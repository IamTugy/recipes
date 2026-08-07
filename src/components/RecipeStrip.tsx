import { Link } from 'react-router-dom'
import type { Recipe } from '../types'
import { categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'

interface RecipeStripProps {
  title: string
  recipes: Recipe[]
}

export default function RecipeStrip({ title, recipes }: RecipeStripProps) {
  const { lang } = useLanguage()

  if (recipes.length === 0) return null

  return (
    <div className="max-w-6xl mx-auto px-6 mb-8">
      <p className="text-cream/25 text-xs tracking-wider mb-3">{title}</p>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {recipes.map(r => {
          const recipeTitle = lang === 'he' ? (r.titleHe ?? r.title) : r.title
          return (
            <Link key={r.id} to={`/recipes/${r.id}`} className="shrink-0 w-32 group">
              <div className="relative h-20 w-32 rounded-lg overflow-hidden mb-1.5">
                {r.image?.includes('assets.tugy.dev') ? (
                  <img
                    src={r.image}
                    alt={recipeTitle}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-tint/[0.05] flex items-center justify-center text-2xl">
                    {categoryEmoji[r.category]}
                  </div>
                )}
              </div>
              <p className="text-xs text-cream/70 group-hover:text-amber transition-colors line-clamp-1" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                {recipeTitle}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
