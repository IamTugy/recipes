import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollections } from '../hooks/useCollections'
import { useRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { heUnit } from '../i18n'

interface CollectionsPageProps {
  onAddToShoppingList: (items: { name: string; amount: string }[], recipeTitle: string) => void
}

export default function CollectionsPage({ onAddToShoppingList }: CollectionsPageProps) {
  const { lang } = useLanguage()
  const { showToast } = useToast()
  const { collections, loading, create, rename, remove, removeRecipe } = useCollections()
  const { recipes } = useRecipes()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  function startEditing(id: string, currentName: string) {
    setEditingId(id)
    setEditingName(currentName)
  }

  function commitEdit() {
    const name = editingName.trim()
    if (name && editingId) rename(editingId, name)
    setEditingId(null)
  }

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    create(name)
    setNewName('')
    showToast(lang === 'he' ? `האוסף "${name}" נוצר` : `Collection "${name}" created`)
  }

  function handleRemove(id: string, name: string) {
    remove(id)
    showToast(lang === 'he' ? `האוסף "${name}" נמחק` : `Collection "${name}" deleted`)
  }

  function handleAddCollectionToShoppingList(slugs: string[]) {
    let recipeCount = 0
    for (const slug of slugs) {
      const r = recipes.find(rec => rec.id === slug)
      if (!r) continue
      recipeCount++
      const title = lang === 'he' ? (r.titleHe ?? r.title) : r.title
      const items = r.ingredients.flatMap(group =>
        group.items.map(item => {
          const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
          if (!item.amount) return { name: itemName, amount: '' }
          const unit = lang === 'he' ? heUnit(item.unit, item.amount) : item.unit
          return { name: itemName, amount: unit ? `${item.amount} ${unit}` : `${item.amount}` }
        })
      )
      onAddToShoppingList(items, title)
    }
    showToast(
      lang === 'he'
        ? `המצרכים של ${recipeCount} מתכונים נוספו לרשימת הקניות`
        : `Added ingredients from ${recipeCount} recipes to your shopping list`
    )
  }

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {lang === 'he' ? 'האוספים שלי' : 'My Collections'}
        </h1>

        <div className="card p-4 mb-6 flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder={lang === 'he' ? 'שם אוסף חדש...' : 'New collection name...'}
            maxLength={60}
            aria-label={lang === 'he' ? 'שם אוסף חדש' : 'New collection name'}
            className="flex-1 bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
          <button type="button"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {lang === 'he' ? 'צור אוסף' : 'Create'}
          </button>
        </div>

        {loading ? (
          <p className="text-cream/30 text-sm">{lang === 'he' ? 'טוען...' : 'Loading...'}</p>
        ) : collections.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {lang === 'he' ? 'אין עדיין אוספים. צרו את הראשון למעלה!' : 'No collections yet. Create your first one above!'}
          </p>
        ) : (
          <div className="space-y-6">
            {collections.map(col => (
              <div key={col._id} className="card p-5">
                <div className="flex items-center justify-between mb-3 gap-2">
                  {editingId === col._id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      maxLength={60}
                      aria-label={lang === 'he' ? 'שם האוסף' : 'Collection name'}
                      className="font-serif text-lg font-medium text-cream bg-tint/[0.03] border border-amber/30 rounded-lg px-2 py-0.5 outline-none flex-1 min-w-0"
                      dir={lang === 'he' ? 'rtl' : 'ltr'}
                    />
                  ) : (
                    <h2
                      className="font-serif text-lg font-medium text-cream cursor-pointer hover:text-amber transition-colors truncate"
                      onClick={() => startEditing(col._id, col.name)}
                      title={lang === 'he' ? 'לחצו לעריכת השם' : 'Click to rename'}
                    >
                      {col.name} <span className="text-cream/30 text-sm font-sans">({col.recipeSlugs.length})</span>
                    </h2>
                  )}
                  <div className="flex items-center gap-3 shrink-0">
                    {col.recipeSlugs.length > 0 && (
                      <button type="button"
                        onClick={() => handleAddCollectionToShoppingList(col.recipeSlugs)}
                        className="text-xs text-cream/40 hover:text-amber transition-colors"
                      >
                        {lang === 'he' ? 'הוסף הכל לרשימת קניות' : 'Add all to shopping list'}
                      </button>
                    )}
                    <button type="button"
                      onClick={() => handleRemove(col._id, col.name)}
                      className="text-xs text-cream/30 hover:text-red-400 transition-colors"
                    >
                      {lang === 'he' ? 'מחק' : 'Delete'}
                    </button>
                  </div>
                </div>
                {col.recipeSlugs.length === 0 ? (
                  <p className="text-xs text-cream/25">
                    {lang === 'he' ? 'אין עדיין מתכונים באוסף הזה' : 'No recipes in this collection yet'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {col.recipeSlugs.map(slug => {
                      const r = recipes.find(rec => rec.id === slug)
                      if (!r) return null
                      const title = lang === 'he' ? (r.titleHe ?? r.title) : r.title
                      return (
                        <div key={slug} className="group relative">
                          <Link to={`/recipe/${slug}`}>
                            <div className="relative h-24 rounded-xl overflow-hidden mb-2 bg-tint/[0.04]">
                              {r.image?.includes('assets.tugy.dev') && (
                                <img src={r.image} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                              )}
                            </div>
                            <p className="text-xs text-cream/70 line-clamp-1">{title}</p>
                          </Link>
                          <button type="button"
                            onClick={() => removeRecipe(col._id, slug)}
                            aria-label={lang === 'he' ? 'הסר מהאוסף' : 'Remove from collection'}
                            className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
