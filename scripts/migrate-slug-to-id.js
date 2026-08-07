// One-time migration: every collection that referenced a recipe by its
// title-derived slug now references it by the recipe's real Mongo _id
// instead (see the recipe-id-in-urls change). Run once against the live
// database with:
//   mongosh <connection-string> scripts/migrate-slug-to-id.js
// Idempotent - safe to re-run; already-migrated documents are skipped
// because their old field no longer exists.

const recipes = db.recipes.find({}, { slug: 1 }).toArray()
const slugToId = {}
recipes.forEach(r => { slugToId[r.slug] = r._id.toString() })
print(`Loaded ${recipes.length} recipes for slug->id lookup`)

function migrateField(collName, oldField, newField) {
  const docs = db[collName].find({ [oldField]: { $exists: true } }).toArray()
  let migrated = 0
  let unresolved = 0
  docs.forEach(doc => {
    const id = slugToId[doc[oldField]]
    if (!id) {
      unresolved++
      print(`  ! ${collName} ${doc._id}: no recipe found for slug '${doc[oldField]}', leaving untouched`)
      return
    }
    db[collName].updateOne(
      { _id: doc._id },
      { $set: { [newField]: id }, $unset: { [oldField]: '' } },
    )
    migrated++
  })
  print(`${collName}: migrated ${migrated}, unresolved ${unresolved}`)
}

function migrateArrayField(collName, oldField, newField) {
  const docs = db[collName].find({ [oldField]: { $exists: true } }).toArray()
  let migrated = 0
  docs.forEach(doc => {
    const ids = (doc[oldField] || []).map(s => slugToId[s]).filter(Boolean)
    db[collName].updateOne(
      { _id: doc._id },
      { $set: { [newField]: ids }, $unset: { [oldField]: '' } },
    )
    migrated++
  })
  print(`${collName}: migrated ${migrated}`)
}

// activitylogs already uses the field name "recipeId" (it was never
// literally called "...Slug"), but its stored values are still slugs -
// fix the values only, no rename.
function migrateValuesOnly(collName, field) {
  const docs = db[collName].find({}).toArray()
  let migrated = 0
  docs.forEach(doc => {
    const id = slugToId[doc[field]]
    if (id && id !== doc[field]) {
      db[collName].updateOne({ _id: doc._id }, { $set: { [field]: id } })
      migrated++
    }
  })
  print(`${collName}: migrated ${migrated}`)
}

// Drop the old slug-keyed unique indexes FIRST - otherwise, as soon as a
// second document for the same user has its recipeSlug unset in the loop
// below, it collides with the first on (userId, null) under the still-live
// old index. The app recreates the id-keyed indexes on next boot
// (Mongoose autoIndex).
function dropIndexIfExists(collName, indexName) {
  try {
    db[collName].dropIndex(indexName)
    print(`${collName}: dropped index ${indexName}`)
  } catch (e) {
    print(`${collName}: no index ${indexName} to drop (${e.message})`)
  }
}

dropIndexIfExists('favorites', 'userId_1_recipeSlug_1')
dropIndexIfExists('ratings', 'userId_1_recipeSlug_1')
dropIndexIfExists('notes', 'userId_1_recipeSlug_1')
dropIndexIfExists('cooklogs', 'userId_1_recipeSlug_1')
dropIndexIfExists('reciperevisions', 'recipeSlug_1_revisionNumber_1')

migrateField('favorites', 'recipeSlug', 'recipeId')
migrateField('ratings', 'recipeSlug', 'recipeId')
migrateField('reviewreplies', 'recipeSlug', 'recipeId')
migrateField('notes', 'recipeSlug', 'recipeId')
migrateField('cooklogs', 'recipeSlug', 'recipeId')
migrateField('mealplanentries', 'recipeSlug', 'recipeId')
migrateField('reciperevisions', 'recipeSlug', 'recipeId')
migrateArrayField('collections', 'recipeSlugs', 'recipeIds')
migrateValuesOnly('activitylogs', 'recipeId')

print('Migration complete.')
