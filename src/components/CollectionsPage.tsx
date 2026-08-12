import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollections } from '../hooks/useCollections'
import { useRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import { resizedImage } from '../lib/image'
import TranslatedText from './TranslatedText'
import SkeletonImage from './SkeletonImage'
import { t } from "../i18n";

interface CollectionsPageProps {
  onAddToShoppingList: (items: { name: string; amount: number | null; unit: string }[]) => void
}

export default function CollectionsPage({ onAddToShoppingList }: CollectionsPageProps) {
  const { lang } = useLanguage()
        const tx = t[lang]
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
    showToast(tx.collectionCreatedNamed(name))
  }

  function handleRemove(id: string, name: string) {
    remove(id)
    showToast(tx.collectionDeletedNamed(name))
  }

  function handleAddCollectionToShoppingList(slugs: string[]) {
    let recipeCount = 0
    for (const slug of slugs) {
      const r = recipes.find(rec => rec.id === slug)
      if (!r) continue
      recipeCount++
      const items = r.ingredients.flatMap(group =>
        group.items
          // A linked ingredient represents "make this other recipe as a
          // component," not a literal item to buy.
          .filter(item => !item.linkedRecipeId)
          .map(item => {
            const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
            return { name: itemName, amount: item.amount || null, unit: item.unit }
          })
      )
      onAddToShoppingList(items)
    }
    showToast(tx.ingredientsFromRecipesAddedToShoppingList(recipeCount))
  }

  return (
    <div className="print:hidden min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {tx.myCollections}
        </h1>

        <div className="card p-4 mb-6 flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder={tx.newCollectionName2}
            maxLength={60}
            aria-label={tx.newCollectionName}
            className="flex-1 bg-tint/[0.03] border border-tint/10 rounded-lg px-3 py-2 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
          <button type="button"
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {tx.create}
          </button>
        </div>

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : collections.length === 0 ? (
          <p className="text-cream/30 text-sm">
            {tx.noCollectionsYetCreateYourFirst}
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
                      aria-label={tx.collectionName}
                      className="font-serif text-lg font-medium text-cream bg-tint/[0.03] border border-amber/30 rounded-lg px-2 py-0.5 outline-none flex-1 min-w-0"
                      dir={lang === 'he' ? 'rtl' : 'ltr'}
                    />
                  ) : (
                    <h2
                      className="font-serif text-lg font-medium text-cream cursor-pointer hover:text-amber transition-colors truncate"
                      onClick={() => startEditing(col._id, col.name)}
                      title={tx.clickToRename}
                    >
                      {col.name} <span className="text-cream/30 text-sm font-sans">({col.recipeIds.length})</span>
                    </h2>
                  )}
                  <div className="flex items-center gap-3 shrink-0">
                    {col.recipeIds.length > 0 && (
                      <Link
                        to={`/collections/${col._id}/print`}
                        className="text-xs text-cream/40 hover:text-amber transition-colors"
                      >
                        {tx.exportAsPDF}
                      </Link>
                    )}
                    {col.recipeIds.length > 0 && (
                      <button type="button"
                        onClick={() => handleAddCollectionToShoppingList(col.recipeIds)}
                        className="text-xs text-cream/40 hover:text-amber transition-colors"
                      >
                        {tx.addAllToShoppingList}
                      </button>
                    )}
                    <button type="button"
                      onClick={() => handleRemove(col._id, col.name)}
                      className="text-xs text-cream/30 hover:text-red-400 transition-colors"
                    >
                      {tx.delete}
                    </button>
                  </div>
                </div>
                {col.recipeIds.length === 0 ? (
                  <p className="text-xs text-cream/25">
                    {tx.noRecipesInThisCollectionYet}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {col.recipeIds.map(slug => {
                      const r = recipes.find(rec => rec.id === slug)
                      if (!r) return null
                      const altFallback = lang === 'he' ? (r.titleHe ?? r.title) : r.title
                      return (
                        <div key={slug} className="group relative">
                          <Link to={`/recipes/${slug}`}>
                            <div className="relative h-24 rounded-xl overflow-hidden mb-2 bg-tint/[0.04]">
                              {r.image?.includes('assets.tugy.dev') && (
                                <SkeletonImage src={resizedImage(r.image, 320)} alt={altFallback} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                              )}
                            </div>
                            <p className="text-xs text-cream/70 line-clamp-1">
                              <TranslatedText
                                primary={lang === 'he' ? r.titleHe : r.title}
                                secondary={lang === 'he' ? r.title : r.titleHe}
                              />
                            </p>
                          </Link>
                          <button type="button"
                            onClick={() => removeRecipe(col._id, slug)}
                            aria-label={tx.removeFromCollection}
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
