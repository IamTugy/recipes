import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { Recipe } from '../types'
import { formatTime } from '../utils/format'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import Highlight from './Highlight'
import CategoryIllustration from './placeholders/CategoryIllustration'
import { Sparkle } from './motifs'

interface RecipeCardProps {
  recipe: Recipe
  index: number
  searchQuery: string
}

const difficultyColor = {
  easy: 'text-accent-soft',
  medium: 'text-accent',
  hard: 'text-highlight',
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

  const hasImage = recipe.image && recipe.image.includes('assets.tugy.dev')

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, duration: 0.4 }}
      whileHover={{ y: -4 }}
    >
      <Link to={`/recipe/${recipe.id}`} className="block group">
        <div className="card card-paper overflow-hidden relative">
          {/* Illustration / image */}
          <div className="relative h-48 overflow-hidden">
            {hasImage ? (
              <img
                src={recipe.image}
                alt={displayTitle}
                className="w-full h-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.06]"
                loading="lazy"
              />
            ) : (
              <CategoryIllustration category={recipe.category} title={recipe.id} />
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />

            <div className="absolute top-3 left-3">
              <span className="tag">
                <span>{categoryEmoji[recipe.category]}</span>
                <span>{tx.categories[recipe.category]}</span>
              </span>
            </div>
            {recipe.featured && (
              <div className="absolute top-3 right-3">
                <span className="tag-terra flex items-center gap-1">
                  <Sparkle width="10" height="10" />
                  {tx.featured}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-5">
            <h3
              className="font-serif text-xl font-medium text-ink leading-snug mb-1 group-hover:text-accent transition-colors line-clamp-1"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
              <Highlight text={displayTitle} query={searchQuery} />
            </h3>
            {displaySubtitle && displaySubtitle !== displayTitle && (
              <p
                className="text-ink/30 text-[11px] mb-2.5 font-light tracking-wide"
                dir={lang === 'he' ? 'ltr' : 'rtl'}
              >
                {displaySubtitle}
              </p>
            )}
            <p
              className="text-ink/55 text-[13px] leading-relaxed line-clamp-2 mb-4"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
              <Highlight text={displayDescription} query={searchQuery} />
            </p>

            <div className="flex items-center gap-3 text-[11px] text-ink/50 border-t border-tint/[0.05] pt-3">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0114 0z" />
                </svg>
                {formatTime(totalTime)}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {recipe.servings}
              </span>
              <span className={`font-medium smallcaps ${difficultyColor[recipe.difficulty]}`}>
                {tx.difficulty[recipe.difficulty]}
              </span>
              {recipe.cuisine && (
                <span className="ml-auto text-ink/30 italic font-serif text-xs">{recipe.cuisine}</span>
              )}
            </div>

            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {displayTags.slice(0, 3).map(tag => (
                  <span key={tag} className="tag-herb text-[10px]">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
