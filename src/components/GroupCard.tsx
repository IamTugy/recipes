import { motion } from 'framer-motion'
import type { DishGroupSummary } from './VirtualRecipeGrid'
import { useLanguage } from '../hooks/useLanguage'
import { t } from '../i18n'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'

interface GroupCardProps {
  group: DishGroupSummary
  index: number
  onSelect: (groupId: string) => void
  imageLoading?: 'eager' | 'lazy'
}

export default function GroupCard({ group, index, onSelect, imageLoading }: GroupCardProps) {
  const { lang } = useLanguage()
  const tx = t[lang]
  const name = (lang === 'he' ? group.nameHe : group.name) ?? group.name
  const thumbs = group.previewRecipes.slice(0, 4)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      className="h-full"
    >
      <button type="button" onClick={() => onSelect(group.id)} className="block group h-full w-full text-start">
        <div className="card overflow-hidden h-full flex flex-col">
          <div className="relative h-52 sm:h-60 overflow-hidden grid grid-cols-2 grid-rows-2 gap-0.5">
            {thumbs.map(recipe => (
              recipe.image?.includes('assets.tugy.dev') ? (
                <SkeletonImage
                  key={recipe.id}
                  src={resizedImage(recipe.image, 320)}
                  alt={name}
                  className="w-full h-full object-cover"
                  loading={imageLoading ?? 'lazy'}
                />
              ) : (
                <div key={recipe.id} className="w-full h-full bg-tint/[0.06]" />
              )
            ))}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <span className="flex items-center gap-1 h-7 px-2.5 rounded-full backdrop-blur-sm border bg-black/30 border-white/20 text-white/80 text-xs font-medium">
                {tx.dishGroupCount(group.count)}
              </span>
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col">
            <h3 className="font-serif text-lg font-medium text-cream group-hover:text-amber transition-colors">
              {name}
            </h3>
            <p className="text-xs text-cream/40 mt-1">{tx.dishGroupTapToSeeAll}</p>
          </div>
        </div>
      </button>
    </motion.div>
  )
}
