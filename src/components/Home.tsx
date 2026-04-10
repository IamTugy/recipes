import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Category } from '../types'
import { categoryEmoji, categoryLabels, recipes } from '../data/recipes'
import RecipeCard from './RecipeCard'

const categories: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']

export default function Home() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)

  const filtered = useMemo(() => {
    let list = recipes
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q)) ||
        (r.cuisine?.toLowerCase().includes(q))
      )
    }
    return list
  }, [search, activeCategory])

  const featured = recipes.filter(r => r.featured)

  return (
    <div className="min-h-screen bg-bg">
      {/* Hero */}
      <div className="relative overflow-hidden pt-14">
        <div className="absolute inset-0 bg-gradient-to-b from-amber/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-amber text-sm font-semibold uppercase tracking-widest mb-3"
          >
            Tugy's Kitchen
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-5xl sm:text-7xl font-bold text-cream leading-tight mb-4"
          >
            Recipes with
            <span className="block text-amber">Love</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-cream/60 text-lg max-w-lg mx-auto mb-10"
          >
            Mediterranean & Israeli home cooking — tested, loved, and shared by Tugy.
          </motion.p>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="max-w-md mx-auto relative"
          >
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/30"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="input-field pl-11 w-full"
            />
          </motion.div>
        </div>
      </div>

      {/* Featured strip (only on home without filters) */}
      {!search && !activeCategory && featured.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 mb-10">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-amber text-lg">★</span>
            <h2 className="font-serif text-xl font-bold text-cream">Featured</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map((r, i) => (
              <RecipeCard key={r.id} recipe={r} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="max-w-6xl mx-auto px-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeCategory === null
                ? 'bg-amber text-bg'
                : 'bg-surface border border-white/10 text-cream/60 hover:text-cream'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-amber text-bg'
                  : 'bg-surface border border-white/10 text-cream/60 hover:text-cream'
              }`}
            >
              <span>{categoryEmoji[cat]}</span>
              <span>{categoryLabels[cat]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-4 pb-24">
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-cream/40">
            <p className="text-4xl mb-3">🥺</p>
            <p className="text-lg">No recipes found</p>
            <p className="text-sm mt-1">Try a different search or category</p>
          </div>
        ) : (
          <>
            {(search || activeCategory) && (
              <p className="text-cream/40 text-sm mb-5">{filtered.length} recipe{filtered.length !== 1 ? 's' : ''} found</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r, i) => (
                <RecipeCard key={r.id} recipe={r} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
