import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Recipe } from '../types'
import { formatTime } from '../utils/format'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import Highlight from './Highlight'

interface RecipeCardProps {
  recipe: Recipe
  index: number
  searchQuery: string
}

const difficultyColor = {
  easy: 'text-herb',
  medium: 'text-amber',
  hard: 'text-terra',
}

export default function RecipeCard({ recipe, index, searchQuery }: RecipeCardProps) {
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
    >
      <Link to={`/recipe/${recipe.id}`} className="block group">
        <div className="card overflow-hidden">
          {/* Image */}
          <div className="relative h-44 sm:h-48 overflow-hidden">
            <img
              src={recipe.image}
              alt={displayTitle}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
              onError={e => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=900&q=80'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-transparent" />
            <div className="absolute top-3 left-3">
              <span className="tag flex items-center gap-1">
                <span>{categoryEmoji[recipe.category]}</span>
                <span>{tx.categories[recipe.category]}</span>
              </span>
            </div>
            {recipe.featured && (
              <div className="absolute top-3 right-3">
                <span className="tag-terra text-[10px] font-semibold px-2 py-0.5">{tx.featured}</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            <h3
              className="font-serif text-base font-medium text-cream leading-snug mb-0.5 group-hover:text-amber transition-colors line-clamp-1"
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
            <div className="flex items-center gap-3 text-[11px] text-cream/35 border-t border-tint/[0.04] pt-3">
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
              {recipe.cuisine && (
                <span className="ml-auto text-cream/20 tracking-wide">{recipe.cuisine}</span>
              )}
            </div>

            {/* Tags */}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2.5">
                {displayTags.slice(0, 3).map(tag => (
                  <span key={tag} className="tag text-[9px] px-2 py-0.5">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
