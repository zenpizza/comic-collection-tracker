import { ObjectId } from 'mongodb'
import { buildIdentityKey } from './comics.js'

function pickBest(group) {
  return [...group].sort((a, b) => {
    if (a.hasCover && !b.hasCover) return -1
    if (!a.hasCover && b.hasCover) return 1
    const dateA = new Date(a.dateAdded || a.createdAt || 0)
    const dateB = new Date(b.dateAdded || b.createdAt || 0)
    return dateB - dateA
  })[0]
}

/**
 * Upgrade legacy flat `comics` documents (pre-Clerk, no userId) in place
 * into the new per-account schema. See scripts/migrate-to-account-schema.js
 * for the full description of what this does and why.
 *
 * Only touches `comics` documents missing a `userId` field — safe to
 * re-run. Returns a summary; does not write anything unless confirm is
 * true.
 */
export async function migrateLegacyComics(db, { userId, confirm }) {
  if (!userId) {
    throw new Error('userId is required')
  }

  const legacyComics = await db.collection('comics').find({ userId: { $exists: false } }).toArray()

  const groups = {}
  for (const comic of legacyComics) {
    const key = buildIdentityKey(comic)
    if (!groups[key]) groups[key] = []
    groups[key].push(comic)
  }

  let migratedCount = 0
  let skippedDuplicateCount = 0
  let assetsCreated = 0
  let coverImagesRepointed = 0

  for (const [identityKey, group] of Object.entries(groups)) {
    const best = pickBest(group)
    skippedDuplicateCount += group.length - 1

    let coverAssetId = null

    if (best.hasCover) {
      const assetDoc = {
        identityKey,
        images: {},
        metadata: {},
        createdAt: best.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (confirm) {
        const assetResult = await db.collection('coverAssets').insertOne(assetDoc)
        coverAssetId = assetResult.insertedId

        const repointResult = await db.collection('cover_images').updateOne(
          { comicId: best._id.toString() },
          { $set: { comicId: coverAssetId.toString() } }
        )
        if (repointResult.matchedCount > 0) coverImagesRepointed++
      } else {
        coverAssetId = new ObjectId() // placeholder for dry-run reporting only
        coverImagesRepointed++ // would repoint in a real run
      }
      assetsCreated++
    }

    if (confirm) {
      await db.collection('comics').updateOne(
        { _id: best._id },
        { $set: {
          userId,
          identityKey,
          coverAssetId,
          updatedAt: new Date().toISOString(),
        } }
      )
    }
    migratedCount++
  }

  return {
    confirm,
    legacyComicsFound: legacyComics.length,
    uniqueGroups: Object.keys(groups).length,
    migratedCount,
    skippedDuplicateCount,
    assetsCreated,
    coverImagesRepointed,
  }
}
