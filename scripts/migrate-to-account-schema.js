#!/usr/bin/env node

/**
 * One-time migration: split the legacy flat `comics` collection into the
 * new shared `comicMetadata` + per-account `userComics` schema introduced
 * for the Clerk multi-account rollout.
 *
 * What it does, per legacy comic document:
 *   1. Groups legacy comics by series|issueNumber|publisher|variant (the
 *      same dedupe key used by api/lib/comicMetadata.js) so pre-existing
 *      duplicate rows collapse into a single comicMetadata record.
 *   2. Creates one comicMetadata doc per group, preserving hasCover /
 *      coverLastUpdated / volumeId / volumeName from the best legacy row
 *      in that group (prefers the one with a cover, then most recent).
 *   3. Creates one userComics doc per group, tagged with --user-id,
 *      carrying notes/dateAdded from that same best legacy row.
 *   4. Re-points each surviving cover_images document's `comicId` field
 *      from the old comic._id to the new comicMetadata._id. This is a
 *      Mongo field update only — S3 object keys are untouched, since the
 *      stored S3 url/key already fully addresses the object regardless of
 *      what id string happens to be embedded in its path.
 *
 * This script does NOT touch the `comics` collection — it is purely
 * additive/read-only against it, so it's safe to re-run (though running it
 * twice for the same --user-id will create duplicate userComics entries;
 * use POST /api/comics/dedupe afterward if that happens).
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
import { buildDedupeKey } from '../api/lib/comicMetadata.js'

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
    const legacyComics = await db.collection('comics').find({}).toArray()
    console.log(`Found ${legacyComics.length} legacy comics`)

    const groups = {}
    for (const comic of legacyComics) {
      const key = buildDedupeKey(comic)
      if (!groups[key]) groups[key] = []
      groups[key].push(comic)
    }
    console.log(`Grouped into ${Object.keys(groups).length} unique comics`)

    let metadataCreated = 0
    let collectionItemsCreated = 0
    let coverImagesRepointed = 0

    for (const [dedupeKey, group] of Object.entries(groups)) {
      const best = pickBest(group)

      const metadataDoc = {
        dedupeKey,
        series: String(best.series || ''),
        issueNumber: String(best.issueNumber || ''),
        publisher: best.publisher || null,
        year: best.year && !isNaN(best.year) ? Number(best.year) : best.year || null,
        variant: best.variant || null,
        volumeId: best.volumeId || null,
        volumeName: best.volumeName || null,
        hasCover: best.hasCover === true,
        coverLastUpdated: best.coverLastUpdated || null,
        createdAt: best.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      let metadataId
      if (confirm) {
        const result = await db.collection('comicMetadata').insertOne(metadataDoc)
        metadataId = result.insertedId
      } else {
        metadataId = new ObjectId() // placeholder for dry-run logging only
      }
      metadataCreated++

      const userComicDoc = {
        userId,
        comicMetadataId: metadataId,
        notes: best.notes || '',
        dateAdded: best.dateAdded || best.createdAt || new Date().toISOString(),
        createdAt: best.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (confirm) {
        await db.collection('userComics').insertOne(userComicDoc)
      }
      collectionItemsCreated++

      if (confirm && best.hasCover) {
        const repointResult = await db.collection('cover_images').updateOne(
          { comicId: best._id.toString() },
          { $set: { comicId: metadataId.toString() } }
        )
        if (repointResult.matchedCount > 0) coverImagesRepointed++
      } else if (best.hasCover) {
        coverImagesRepointed++ // would repoint in a real run
      }
    }

    console.log('')
    console.log('Migration summary:')
    console.log(`  comicMetadata records created: ${metadataCreated}`)
    console.log(`  userComics records created:    ${collectionItemsCreated}`)
    console.log(`  cover_images repointed:        ${coverImagesRepointed}`)
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
