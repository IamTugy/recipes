import { Link } from 'react-router-dom'
import type { Recipe } from '../types'
import { categoryEmoji } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'

interface RecipeStripProps {
  title: string
  recipes: Recipe[]
  loading?: boolean
}

export default function RecipeStrip({ title, recipes, loading }: RecipeStripProps) {
  const { lang } = useLanguage()

  if (!loading && recipes.length === 0) return null

  return (
    <div className="max-w-6xl mx-auto px-6 mb-8">
      <p className="text-cream/25 text-xs tracking-wider mb-3">{title}</p>
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-32">
              <div className="h-20 w-32 rounded-lg bg-tint/[0.06] animate-pulse mb-1.5" />
              <div className="h-3 w-24 rounded bg-tint/[0.06] animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {recipes.map(r => {
          const recipeTitle = lang === 'he' ? (r.titleHe ?? r.title) : r.title
          return (
            <Link key={r.id} to={`/recipes/${r.id}`} className="shrink-0 w-32 group">
              <div className="relative h-20 w-32 rounded-lg overflow-hidden mb-1.5">
                {r.image?.includes('assets.tugy.dev') ? (
                  <SkeletonImage
                    src={resizedImage(r.image, 320)}
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
      )}
    </div>
  )
}
