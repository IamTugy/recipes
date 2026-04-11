export default function RecipeCardSkeleton() {
  return (
    <div className="card overflow-hidden animate-pulse">
      {/* Image placeholder */}
      <div className="h-44 sm:h-48 bg-tint/[0.06]" />

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <div className="h-4 bg-tint/[0.06] rounded-md w-3/4 mb-2" />
        {/* Subtitle */}
        <div className="h-3 bg-tint/[0.04] rounded-md w-1/2 mb-3" />
        {/* Description lines */}
        <div className="space-y-1.5 mb-3">
          <div className="h-3 bg-tint/[0.04] rounded-md w-full" />
          <div className="h-3 bg-tint/[0.04] rounded-md w-4/5" />
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 border-t border-tint/[0.04] pt-3">
          <div className="h-3 bg-tint/[0.04] rounded-md w-12" />
          <div className="h-3 bg-tint/[0.04] rounded-md w-8" />
          <div className="h-3 bg-tint/[0.04] rounded-md w-10" />
        </div>

        {/* Tags */}
        <div className="flex gap-1 mt-2.5">
          <div className="h-4 bg-tint/[0.04] rounded-md w-12" />
          <div className="h-4 bg-tint/[0.04] rounded-md w-16" />
        </div>
      </div>
    </div>
  )
}
