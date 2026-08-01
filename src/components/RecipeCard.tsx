import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Recipe } from '../types'
import { formatTime } from '../utils/format'
import { t, categoryEmoji, difficultyColor } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import Highlight from './Highlight'
import RecipePlaceholder from './RecipePlaceholder'

interface RecipeCardProps {
  recipe: Recipe
  index: number
  searchQuery: string
  isFavorite: boolean
  onToggleFavorite: (slug: string) => void
}


export default function RecipeCard({ recipe, index, searchQuery, isFavorite, onToggleFavorite }: RecipeCardProps) {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const tx = t[lang]
  const totalTime = recipe.prepTime + recipe.cookTime

  const displayTitle = lang === 'he' ? (recipe.titleHe ?? recipe.title) : recipe.title
  const displaySubtitle = lang === 'he' ? recipe.title : recipe.titleHe
  const displayDescription = lang === 'he'
    ? recipe.description
    : (recipe.descriptionEn ?? recipe.description)
  const displayTags = lang === 'he' ? recipe.tags : (recipe.tagsEn ?? recipe.tags)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className="h-full"
    >
      <Link to={`/recipe/${recipe.id}`} className="block group h-full">
        <div className="card overflow-hidden h-full flex flex-col">
          {/* Image */}
          <div className="relative h-52 sm:h-60 overflow-hidden">
            {recipe.image.includes('assets.tugy.dev') ? (
              <img
                src={recipe.image}
                alt={displayTitle}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading={index < 4 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'auto'}
              />
            ) : (
              <RecipePlaceholder recipe={recipe} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-transparent" />
            <div className="absolute top-3 left-3">
              <span className="tag flex items-center gap-1">
                <span>{categoryEmoji[recipe.category]}</span>
                <span>{tx.categories[recipe.category]}</span>
              </span>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {recipe.featured && (
                <span className="tag-terra text-[10px] font-semibold px-2 py-0.5">{tx.featured}</span>
              )}
              <button type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(recipe.id) }}
                className={`h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-full backdrop-blur-sm border transition-colors ${
                  isFavorite
                    ? 'bg-amber/90 border-amber text-bg'
                    : 'bg-black/30 border-white/20 text-white/80 hover:text-white'
                }`}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg className="w-3.5 h-3.5" fill={isFavorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex flex-col flex-1">
            <h3
              className="font-serif text-lg font-medium text-cream leading-snug mb-0.5 group-hover:text-amber transition-colors line-clamp-1"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
              <Highlight text={displayTitle} query={searchQuery} />
            </h3>
            {displaySubtitle && displaySubtitle !== displayTitle && (
              <p
                className="text-cream/25 text-[11px] mb-2 font-light tracking-wide"
                dir={lang === 'he' ? 'ltr' : 'rtl'}
              >
                {displaySubtitle}
              </p>
            )}
            <p
              className="text-cream/50 text-xs leading-relaxed line-clamp-2 mb-3"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
              <Highlight text={displayDescription} query={searchQuery} />
            </p>

            {/* Meta row */}
            <div className="mt-auto flex items-center gap-3 text-[11px] text-cream/35 border-t border-tint/[0.04] pt-3">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0114 0z" />
                </svg>
                {formatTime(totalTime)}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {recipe.servings}
              </span>
              <span className={`font-medium ${difficultyColor[recipe.difficulty]}`}>
                {tx.difficulty[recipe.difficulty]}
              </span>
              {!!recipe.averageRating && (
                <span className="flex items-center gap-1 text-amber">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.175 0l-3.367 2.446c-.784.57-1.838-.196-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.813 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z" />
                  </svg>
                  {recipe.averageRating}
                </span>
              )}
              {recipe.cuisine && (
                <span className="ml-auto text-cream/20 tracking-wide">{recipe.cuisine}</span>
              )}
            </div>

            {/* Tags */}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2.5">
                {displayTags.slice(0, 3).map(tag => (
                  <button type="button"
                    key={tag}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/?tag=${encodeURIComponent(tag)}`) }}
                    className="tag text-[9px] px-2 py-0.5 hover:text-amber transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
