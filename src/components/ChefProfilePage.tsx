import { useParams } from 'react-router-dom'
import { useChefProfile } from '../hooks/useRecipes'
import { useFavorites } from '../hooks/useFavorites'
import { useFollow } from '../hooks/useFollow'
import { useLanguage } from '../hooks/useLanguage'
import RecipeCard from './RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import Avatar from './Avatar'
import { t } from "../i18n";

export default function ChefProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { lang } = useLanguage()
        const tx = t[lang]
  const { name, imageUrl, recipes, followerCount, loading } = useChefProfile(userId)
  const { favoriteSlugs, toggle: toggleFavorite } = useFavorites()
  const { following, toggle: toggleFollow, isSelf } = useFollow(userId)
  const displayName = name ?? (tx.chef)

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Avatar name={displayName} imageUrl={imageUrl} size="md" />
          <h1 className="font-serif text-2xl font-bold text-cream">
            {displayName}
          </h1>
          {!isSelf && !loading && (
            <button type="button"
              onClick={toggleFollow}
              className={`shrink-0 px-4 h-9 rounded-full text-sm font-medium transition-colors ${
                following
                  ? 'border border-tint/[0.12] text-cream/60 hover:border-amber/40 hover:text-amber bg-transparent'
                  : 'bg-amber text-bg hover:bg-amber/90'
              }`}
            >
              {following ? tx.following : tx.follow}
            </button>
          )}
        </div>
        <p className="text-cream/30 text-xs mb-6">
          {loading
            ? (tx.loading)
            : `${recipes.length} ${tx.publishedRecipes} · ${tx.followers(followerCount)}`}
        </p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <RecipeCardSkeleton key={i} />)}
          </div>
        ) : recipes.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {tx.noPublishedRecipesYet}
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
