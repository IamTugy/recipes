import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '../types'
import { recipes } from '../data/recipes'
import { t, categoryEmoji } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import RecipeCard from './RecipeCard'

const categories: Category[] = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']

export default function Home() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)

  const filtered = useMemo(() => {
    let list = recipes
    if (activeCategory) list = list.filter(r => r.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => {
        if (lang === 'en') {
          return (
            r.title.toLowerCase().includes(q) ||
            (r.descriptionEn ?? r.description).toLowerCase().includes(q) ||
            (r.tagsEn ?? r.tags).some(t => t.toLowerCase().includes(q)) ||
            (r.cuisine?.toLowerCase().includes(q))
          )
        }
        return (
          (r.titleHe ?? r.title).toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q)) ||
          (r.cuisine?.toLowerCase().includes(q))
        )
      })
    }
    return list
  }, [search, activeCategory, lang])

  const featured = recipes.filter(r => r.featured)

  return (
    <div className="min-h-screen bg-bg">

      {/* Hero - featured recipe strip */}
      {!search && !activeCategory && (
        <div className="pt-14">
          <div className="max-w-6xl mx-auto px-6 pt-8 pb-6">
            {/* Featured grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-8" style={{ gridTemplateRows: '220px' }}>
              {/* Large left card */}
              {featured[0] && (
                <Link
                  to={`/recipe/${featured[0].id}`}
                  className="col-span-2 row-span-1 relative overflow-hidden rounded-xl group"
                  style={{ height: '220px' }}
                >
                  <img
                    src={featured[0].image}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=900&q=80' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-[10px] text-amber/80 uppercase tracking-widest mb-1 font-medium">{tx.featured}</p>
                    <h3 className="font-serif text-white text-lg sm:text-xl font-medium leading-tight line-clamp-2" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                      {lang === 'he' ? (featured[0].titleHe ?? featured[0].title) : featured[0].title}
                    </h3>
                  </div>
                </Link>
              )}

              {/* Right column - 2 stacked */}
              <div className="col-span-2 grid grid-cols-2 gap-2 sm:gap-3" style={{ height: '220px' }}>
                {featured.slice(1, 5).map(r => (
                  <Link
                    key={r.id}
                    to={`/recipe/${r.id}`}
                    className="relative overflow-hidden rounded-xl group"
                  >
                    <img
                      src={r.image}
                      alt=""
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=900&q=80' }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2.5">
                      <h3 className="font-serif text-white text-xs sm:text-sm font-medium leading-tight line-clamp-2" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                        {lang === 'he' ? (r.titleHe ?? r.title) : r.title}
                      </h3>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="max-w-sm relative">
              <svg
                className={`absolute ${lang === 'he' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 w-4 h-4 text-cream/25`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tx.searchPlaceholder}
                className={`input-field ${lang === 'he' ? 'pr-11 text-right' : 'pl-11'} w-full`}
                dir={lang === 'he' ? 'rtl' : 'ltr'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Search-only header (when searching/filtering) */}
      {(search || activeCategory) && (
        <div className="pt-14">
          <div className="max-w-6xl mx-auto px-6 pt-8 pb-6">
            <div className="max-w-sm relative">
              <svg
                className={`absolute ${lang === 'he' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 w-4 h-4 text-cream/25`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tx.searchPlaceholder}
                className={`input-field ${lang === 'he' ? 'pr-11 text-right' : 'pl-11'} w-full`}
                dir={lang === 'he' ? 'rtl' : 'ltr'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="max-w-6xl mx-auto px-6 mb-8">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
              activeCategory === null
                ? 'text-amber bg-amber/10 border border-amber/20'
                : 'text-cream/40 hover:text-cream/70 border border-transparent'
            }`}
          >
            {tx.categories.all}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs tracking-wider font-medium transition-colors rounded-lg ${
                activeCategory === cat
                  ? 'text-amber bg-amber/10 border border-amber/20'
                  : 'text-cream/40 hover:text-cream/70 border border-transparent'
              }`}
            >
              <span className="text-sm">{categoryEmoji[cat]}</span>
              <span>{tx.categories[cat]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recipe grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <p className="text-cream/25 text-xs tracking-wider mb-5">
          {(search || activeCategory)
            ? `${filtered.length} / ${recipes.length}`
            : `${recipes.length}`
          }
          {' '}{lang === 'he' ? 'מתכונים' : 'recipes'}
        </p>

        {filtered.length === 0 ? (
          <div className="text-center py-24 text-cream/30">
            <p className="text-sm tracking-widest uppercase mb-2">{tx.noResultsTitle}</p>
            <p className="text-xs">{tx.noResultsHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r, i) => (
              <RecipeCard key={r.id} recipe={r} index={i} searchQuery={search} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
