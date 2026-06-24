#!/usr/bin/env node

/**
 * One-time migration: upgrade legacy flat `comics` documents (pre-Clerk,
 * no userId) in place into the new per-account schema — each row gets a
 * `userId`, an `identityKey`, and a `coverAssetId` pointing at a shared
 * `coverAssets` entry (instead of splitting into separate comicMetadata/
 * userComics collections).
 *
 * What it does:
 *   1. Reads only `comics` documents that don't yet have a `userId` field
 *      (i.e. not-yet-migrated legacy rows) — safe to re-run.
 *   2. Groups them by identityKey (same as api/lib/comics.js's
 *      buildIdentityKey) to collapse pre-existing legacy duplicates, since
 *      the new unique {userId, identityKey} index would otherwise reject
 *      a second row for the same issue under the same account.
 *   3. For each group, updates the "best" row (prefers one with a cover,
 *      then most recently added) in place: adds userId/identityKey, and
 *      if it had a cover, creates a `coverAssets` entry for it and
 *      re-points the existing `cover_images` document's `comicId` field
 *      at the new asset id (S3 object keys are untouched — the stored
 *      url/key already fully addresses the object).
 *   4. Leaves non-best duplicates within a group untouched (not deleted) —
 *      they keep their legacy shape and can be cleaned up manually later.
 *
 * Usage:
 *   node scripts/migrate-to-account-schema.js --user-id=<clerkUserId> [--confirm]
 *
 * Defaults to a dry run (no writes) unless --confirm is passed. Run this
 * yourself against the target environment's MongoDB (same MONGODB_URI /
 * env vars the app normally uses) — it is not executed automatically.
 */

import dotenv from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'

dotenv.config()
dotenv.config({ path: '.env.local' })

import { getMongoDBUri, getDatabaseName } from '../api/config.js'
import { buildIdentityKey } from '../api/lib/comics.js'

function parseArgs(argv) {
  const args = { confirm: false }
  for (const arg of argv) {
    if (arg === '--confirm') args.confirm = true
    else if (arg.startsWith('--user-id=')) args.userId = arg.slice('--user-id='.length)
  }
  return args
}

function pickBest(group) {
  return [...group].sort((a, b) => {
    if (a.hasCover && !b.hasCover) return -1
    if (!a.hasCover && b.hasCover) return 1
    const dateA = new Date(a.dateAdded || a.createdAt || 0)
    const dateB = new Date(b.dateAdded || b.createdAt || 0)
    return dateB - dateA
  })[0]
}

async function main() {
  const { userId, confirm } = parseArgs(process.argv.slice(2))

  if (!userId) {
    console.error('Usage: node scripts/migrate-to-account-schema.js --user-id=<clerkUserId> [--confirm]')
    process.exit(1)
  }

  console.log(`Migrating legacy comics to account ${userId}${confirm ? '' : ' (DRY RUN — pass --confirm to write)'}`)

  const client = new MongoClient(getMongoDBUri())
  await client.connect()
  const db = client.db(getDatabaseName())

  try {
    const legacyComics = await db.collection('comics').find({ userId: { $exists: false } }).toArray()
    console.log(`Found ${legacyComics.length} not-yet-migrated legacy comics`)

    const groups = {}
    for (const comic of legacyComics) {
      const key = buildIdentityKey(comic)
      if (!groups[key]) groups[key] = []
      groups[key].push(comic)
    }
    console.log(`Grouped into ${Object.keys(groups).length} unique comics`)

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
          coverAssetId = new ObjectId() // placeholder for dry-run logging only
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

    console.log('')
    console.log('Migration summary:')
    console.log(`  comics migrated:           ${migratedCount}`)
    console.log(`  legacy duplicates skipped:  ${skippedDuplicateCount} (left untouched, not deleted)`)
    console.log(`  coverAssets created:        ${assetsCreated}`)
    console.log(`  cover_images repointed:     ${coverImagesRepointed}`)
    if (!confirm) {
      console.log('')
      console.log('This was a dry run — no data was written. Re-run with --confirm to apply.')
    }
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
