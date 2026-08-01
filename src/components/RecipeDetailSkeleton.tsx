export default function RecipeDetailSkeleton() {
  return (
    <div className="min-h-dvh bg-bg pt-14 animate-pulse">
      {/* Hero image */}
      <div className="h-64 sm:h-96 bg-tint/[0.06]" />

      <div className="max-w-3xl mx-auto px-4 -mt-16 relative pb-24">
        {/* Header card */}
        <div className="card p-6 mb-6">
          <div className="flex gap-2 mb-3">
            <div className="h-5 bg-tint/[0.06] rounded-lg w-20" />
            <div className="h-5 bg-tint/[0.06] rounded-lg w-16" />
          </div>
          <div className="h-8 bg-tint/[0.06] rounded-md w-3/4 mb-2" />
          <div className="h-4 bg-tint/[0.04] rounded-md w-1/3 mb-4" />
          <div className="space-y-1.5 mb-5">
            <div className="h-3 bg-tint/[0.04] rounded-md w-full" />
            <div className="h-3 bg-tint/[0.04] rounded-md w-4/5" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-tint/[0.03] rounded-xl" />
            ))}
          </div>
        </div>

        {/* Portion control */}
        <div className="card p-4 mb-6 h-16" />

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
          {/* Ingredients */}
          <div className="sm:col-span-2 space-y-2">
            <div className="h-5 bg-tint/[0.06] rounded-md w-1/2 mb-2" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 bg-tint/[0.04] rounded-md w-full" />
            ))}
          </div>

          {/* Steps */}
          <div className="sm:col-span-3 space-y-3">
            <div className="h-5 bg-tint/[0.06] rounded-md w-1/3 mb-2" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-tint/[0.02] border border-tint/5 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
