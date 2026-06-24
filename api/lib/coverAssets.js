/**
 * Shared cover image assets — keyed by identityKey (ComicVine issue ID when
 * available, otherwise a normalized manual composite). Independent of any
 * account's comic row: reused on creation, never mutated by a replace/remove
 * (see api/lib/comics.js for the copy-on-write semantics that keep one
 * account's cover edits from affecting another account).
 */

import { ObjectId } from 'mongodb'

const MONGO_DUPLICATE_KEY_ERROR = 11000

export async function ensureIndexes(db) {
  // Partial index: uniqueness only applies when identityKey is a real
  // string. "Private" assets created on cover replace intentionally have
  // identityKey: null (never reusable via identity lookup), and a plain
  // unique index would treat multiple nulls as duplicates.
  await db.collection('coverAssets').createIndex(
    { identityKey: 1 },
    { unique: true, partialFilterExpression: { identityKey: { $type: 'string' } } }
  )
}

export async function findAssetByIdentityKey(db, identityKey) {
  return db.collection('coverAssets').findOne({ identityKey })
}

export async function getAsset(db, assetId) {
  return db.collection('coverAssets').findOne({ _id: new ObjectId(assetId) })
}

/**
 * Create a new asset, or return the existing one if a concurrent request
 * already created it for the same identityKey (relies on the unique index
 * from ensureIndexes — the duplicate-key error is the race-safe signal,
 * not just an optimization).
 */
export async function createAsset(db, { _id, identityKey, images, metadata }) {
  const collection = db.collection('coverAssets')
  const now = new Date().toISOString()

  const doc = {
    identityKey: identityKey || null,
    images: images || {},
    metadata: metadata || {},
    createdAt: now,
    updatedAt: now,
  }
  if (_id) doc._id = _id

  try {
    const result = await collection.insertOne(doc)
    return { ...doc, _id: result.insertedId }
  } catch (error) {
    if (error.code === MONGO_DUPLICATE_KEY_ERROR && identityKey) {
      const existing = await findAssetByIdentityKey(db, identityKey)
      if (existing) return existing
    }
    throw error
  }
}
