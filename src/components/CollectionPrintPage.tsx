import { Link, useParams } from 'react-router-dom'
import { useCollections } from '../hooks/useCollections'
import { useRecipes } from '../hooks/useRecipes'
import { useLanguage } from '../hooks/useLanguage'
import { heUnit, t } from '../i18n'
import { formatTime, scaleAmount } from '../utils/format'

export default function CollectionPrintPage() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useLanguage()
        const tx = t[lang]
  const { collections, loading } = useCollections()
  const { recipes } = useRecipes()

  const collection = collections.find(c => c._id === id)
  const collectionRecipes = collection
    ? collection.recipeIds.map(slug => recipes.find(r => r.id === slug)).filter((r): r is NonNullable<typeof r> => !!r)
    : []

  if (loading) {
    return <div className="min-h-dvh bg-bg pt-24 px-4 text-center text-cream/30 text-sm">{tx.loading}</div>
  }

  if (!collection) {
    return (
      <div className="min-h-dvh bg-bg pt-24 px-4 text-center text-cream/30 text-sm">
        {tx.collectionNotFound}
      </div>
    )
  }

  const generatedOn = new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4 print:pt-0 print:pb-0 print:px-0">
      <div className="print:hidden max-w-3xl mx-auto mb-6 flex items-center justify-between gap-3">
        <Link to="/collections" className="text-sm text-cream/40 hover:text-cream/70 transition-colors">
          {tx.backToCollections}
        </Link>
        <button type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors"
        >
          {tx.printSaveAsPDF}
        </button>
      </div>

      <div className="print-booklet max-w-3xl mx-auto">
        {/* Cover page */}
        <div className="print-cover flex flex-col items-center justify-center text-center py-16 print:h-[100vh] print:break-after-page">
          <p className="text-amber text-xs font-semibold uppercase tracking-[0.3em] mb-4">
            {tx.recipeCollection}
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-cream mb-4" dir={lang === 'he' ? 'rtl' : 'ltr'}>
            {collection.name}
          </h1>
          <p className="text-cream/40 text-sm">
            {tx.collectionRecipesGenerated(collectionRecipes.length, generatedOn)}
          </p>
        </div>

        {collectionRecipes.length === 0 ? (
          <p className="text-center text-cream/30 text-sm">
            {tx.thisCollectionHasNoRecipesYet}
          </p>
        ) : (
          collectionRecipes.map((recipe, i) => {
            const title = lang === 'he' ? (recipe.titleHe ?? recipe.title) : recipe.title
            const description = lang === 'he' ? recipe.description : (recipe.descriptionEn ?? recipe.description)
            const isLast = i === collectionRecipes.length - 1

            return (
              <article
                key={recipe.id}
                className={`print-recipe card p-6 mb-8 print:mb-0 print:p-0 print:border-0 print:shadow-none ${isLast ? '' : 'print:break-after-page'}`}
              >
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-cream mb-1" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                  {title}
                </h2>
                {description && (
                  <p className="text-cream/60 text-sm leading-relaxed mb-4" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                    {description}
                  </p>
                )}

                <div className="grid grid-cols-4 gap-2 mb-6 print:mb-4">
                  {[
                    { label: tx.prep, value: formatTime(recipe.prepTime) },
                    { label: tx.cook, value: formatTime(recipe.cookTime) },
                    { label: tx.servings, value: recipe.servings.toString() },
                    { label: tx.level, value: recipe.difficulty },
                  ].map(item => (
                    <div key={item.label} className="bg-tint/[0.03] print:bg-transparent print:border print:border-tint/15 rounded-lg p-2 text-center">
                      <p className="font-bold text-cream text-sm">{item.value}</p>
                      <p className="text-cream/40 text-xs">{item.label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 print:grid-cols-5">
                  {recipe.ingredients.length > 0 && (
                    <div className="sm:col-span-2 print:col-span-2">
                      <h3 className="font-serif text-lg font-bold text-cream mb-3">
                        {tx.ingredients2}
                      </h3>
                      <div className="space-y-3">
                        {recipe.ingredients.map((group, gi) => {
                          const groupLabel = lang === 'he' ? (group.group || group.groupEn) : (group.groupEn || group.group)
                          return (
                            <div key={gi}>
                              {groupLabel && (
                                <h4 className="text-amber text-xs font-semibold uppercase tracking-wider mb-1.5">{groupLabel}</h4>
                              )}
                              <ul className="space-y-1.5">
                                {group.items.map((item, ii) => {
                                  const itemName = lang === 'he' ? item.name : (item.nameEn ?? item.name)
                                  const itemNote = lang === 'he' ? item.note : (item.noteEn ?? item.note)
                                  const unit = lang === 'he' ? heUnit(item.unit, item.amount) : item.unit
                                  const amt = item.amount ? scaleAmount(item.amount, 1) : null
                                  return (
                                    <li key={ii} className="flex gap-2 text-sm" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                                      <span className="print:inline hidden shrink-0 mt-0.5">•</span>
                                      {amt && (
                                        <span className="font-semibold shrink-0 w-14 text-cream/90" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                                          {unit ? `${amt} ${unit}` : amt}
                                        </span>
                                      )}
                                      <span className="text-cream/70">
                                        {itemName}
                                        {itemNote && <span className="text-cream/40 italic"> ({itemNote})</span>}
                                      </span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="sm:col-span-3 print:col-span-3">
                    <h3 className="font-serif text-lg font-bold text-cream mb-3">
                      {tx.instructions2}
                    </h3>
                    <div className="space-y-4">
                      {recipe.steps.map((group, gi) => {
                        const groupTitle = lang === 'he' ? (group.title || group.titleEn) : (group.titleEn || group.title)
                        let stepNum = 0
                        return (
                          <div key={gi}>
                            {groupTitle && (
                              <h4 className="text-amber text-xs font-semibold uppercase tracking-wider mb-2">{groupTitle}</h4>
                            )}
                            <ol className="space-y-2.5">
                              {group.items.map((step, si) => {
                                stepNum++
                                const instruction = lang === 'he' ? step.instruction : (step.instructionEn ?? step.instruction)
                                return (
                                  <li key={si} className="flex gap-3 text-sm" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-amber/15 text-amber print:border print:border-amber/40 flex items-center justify-center text-xs font-bold">
                                      {stepNum}
                                    </span>
                                    <span className="text-cream/80 leading-relaxed">{instruction}</span>
                                  </li>
                                )
                              })}
                            </ol>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
