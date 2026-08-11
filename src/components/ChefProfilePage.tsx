import { useParams } from 'react-router-dom'
import { useChefProfile } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import Avatar from './Avatar'

export default function ChefProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { lang } = useLanguage()
  const { name, imageUrl, recipes, loading } = useChefProfile(userId)
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const displayName = name ?? (lang === 'he' ? 'שף' : 'Chef')

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Avatar name={displayName} imageUrl={imageUrl} size="md" />
          <h1 className="font-serif text-2xl font-bold text-cream">
            {displayName}
          </h1>
        </div>
        <p className="text-cream/30 text-xs mb-6">
          {loading
            ? (lang === 'he' ? 'טוען...' : 'Loading...')
            : `${recipes.length} ${lang === 'he' ? 'מתכונים שפורסמו' : 'published recipes'}`}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <RecipeCardSkeleton key={i} />)}
          </div>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'עדיין אין מתכונים שפורסמו' : 'No published recipes yet'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((r, i) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                index={i}
                searchQuery=""
                isFavorite={favoriteSlugs.has(r.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
