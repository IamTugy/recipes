import { useFollowingFeed } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import { t } from "../i18n";

export default function FollowingFeedPage() {
  const { lang } = useLanguage()
        const tx = t[lang]
  const { recipes, loading } = useFollowingFeed()
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-1">
          {tx.followingFeed}
        </h1>
        <p className="text-cream/30 text-xs mb-6">
          {tx.followingFeedSubtitle}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <RecipeCardSkeleton key={i} />)}
          </div>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {tx.noRecipesFromFollowedChefsYet}
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
