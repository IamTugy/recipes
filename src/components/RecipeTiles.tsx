import { useNavigate } from 'react-router-dom'
import type { Recipe } from '../types'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'
import RecipePlaceholder from './RecipePlaceholder'

interface RecipeTilesProps {
  recipes: Recipe[]
  lang: 'he' | 'en'
}

// Instagram-style dense 3-column grid of square thumbnails - the middle ground
// between the large RecipeCard grid and the tiny list rows. Kept at 3 columns
// on every breakpoint so it reads the same on mobile and desktop.
export default function RecipeTiles({ recipes, lang }: RecipeTilesProps) {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {recipes.map((r, i) => {
        const title = (lang === 'he' ? r.titleHe : r.title) || r.title
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/recipes/${r.id}`)}
            aria-label={title}
            className="group relative block aspect-square overflow-hidden bg-card"
          >
            {r.image?.includes('assets.tugy.dev') ? (
              <SkeletonImage
                src={resizedImage(r.image, 320)}
                alt=""
                className="w-full h-full object-cover"
                loading={i < 9 ? 'eager' : 'lazy'}
              />
            ) : (
              <RecipePlaceholder recipe={r} />
            )}
            <span
              className="absolute inset-x-0 bottom-0 p-1.5 text-[11px] leading-tight text-white text-start line-clamp-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)' }}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
              {title}
            </span>
          </button>
        )
      })}
    </div>
  )
}
