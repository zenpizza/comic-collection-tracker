import { ObjectId } from 'mongodb'
import { findAssetByIdentityKey } from './coverAssets.js'

const MONGO_DUPLICATE_KEY_ERROR = 11000

export class DuplicateComicError extends Error {
  constructor(message = 'This account already owns this issue') {
    super(message)
    this.name = 'DuplicateComicError'
  }
}

export async function ensureIndexes(db) {
  await db.collection('comics').createIndex({ userId: 1, identityKey: 1 }, { unique: true })
}

/**
 * Identity of a comic, independent of who owns it. Prefers ComicVine's
 * issue id (stable, unambiguous) over a normalized manual composite, since
 * series/issue/publisher text can collide across reboots or similarly named
 * series.
 */
export function buildIdentityKey({ comicVineId, series, issueNumber, publisher, variant, volumeId, year }) {
  if (comicVineId) {
    return `comicvine|${String(comicVineId).trim()}`
  }

  const part = (value) => String(value || '').toLowerCase().trim()
  const volumeOrYear = part(volumeId) || part(year)
  return `manual|${part(series)}|${part(issueNumber)}|${part(publisher)}|${part(variant)}|${volumeOrYear}`
}

function toFlatComic(doc) {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    series: doc.series,
    issueNumber: doc.issueNumber,
    publisher: doc.publisher,
    year: doc.year,
    variant: doc.variant,
    notes: doc.notes,
    dateAdded: doc.dateAdded,
    identityKey: doc.identityKey,
    coverAssetId: doc.coverAssetId ? doc.coverAssetId.toString() : null,
    hasCover: doc.hasCover === true,
    volumeId: doc.volumeId,
    volumeName: doc.volumeName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function addComic(db, { userId, comic }) {
  const collection = db.collection('comics')
  const identityKey = buildIdentityKey(comic)
  const existingAsset = await findAssetByIdentityKey(db, identityKey)
  const now = new Date().toISOString()

  const doc = {
    userId,
    series: comic.series,
    issueNumber: String(comic.issueNumber),
    publisher: comic.publisher || null,
    year: comic.year && !isNaN(comic.year) ? Number(comic.year) : comic.year || null,
    variant: comic.variant || null,
    notes: comic.notes || '',
    dateAdded: comic.dateAdded || now,
    identityKey,
    coverAssetId: existingAsset ? existingAsset._id : null,
    hasCover: !!existingAsset,
    volumeId: comic.volumeId || null,
    volumeName: comic.volumeName || null,
    createdAt: now,
    updatedAt: now,
  }

  try {
    const result = await collection.insertOne(doc)
    return toFlatComic({ ...doc, _id: result.insertedId })
  } catch (error) {
    if (error.code === MONGO_DUPLICATE_KEY_ERROR) {
      throw new DuplicateComicError()
    }
    throw error
  }
}

export async function listComics(db, userId) {
  const docs = await db.collection('comics').find({ userId }).toArray()
  return docs.map(toFlatComic)
}

export async function getComic(db, { userId, comicId }) {
  const doc = await db.collection('comics').findOne({ _id: new ObjectId(comicId), userId })
  return doc ? toFlatComic(doc) : null
}

const CANONICAL_FIELDS = ['series', 'issueNumber', 'publisher', 'year', 'variant', 'volumeId', 'comicVineId']

export async function updateComic(db, { userId, comicId, updates }) {
  const collection = db.collection('comics')
  const existing = await collection.findOne({ _id: new ObjectId(comicId), userId })
  if (!existing) {
    throw new Error('Comic not found in this account\'s collection')
  }

  const set = { updatedAt: new Date().toISOString() }

  if (updates.notes !== undefined) set.notes = updates.notes
  if (updates.dateAdded !== undefined) set.dateAdded = updates.dateAdded

  const hasCanonicalEdit = CANONICAL_FIELDS.some((field) => field in updates)
  if (hasCanonicalEdit) {
    const merged = { ...existing, ...updates }
    const identityKey = buildIdentityKey(merged)

    if (identityKey !== existing.identityKey) {
      const conflict = await collection.findOne({ userId, identityKey, _id: { $ne: existing._id } })
      if (conflict) {
        throw new DuplicateComicError()
      }

      const asset = await findAssetByIdentityKey(db, identityKey)
      set.coverAssetId = asset ? asset._id : null
      set.hasCover = !!asset
    }

    set.series = merged.series
    set.issueNumber = String(merged.issueNumber)
    set.publisher = merged.publisher || null
    set.year = merged.year && !isNaN(merged.year) ? Number(merged.year) : merged.year || null
    set.variant = merged.variant || null
    set.volumeId = merged.volumeId || null
    set.volumeName = merged.volumeName || existing.volumeName
    set.identityKey = identityKey
  }

  try {
    await collection.updateOne({ _id: existing._id, userId }, { $set: set })
  } catch (error) {
    if (error.code === MONGO_DUPLICATE_KEY_ERROR) {
      throw new DuplicateComicError()
    }
    throw error
  }

  const updated = await collection.findOne({ _id: existing._id, userId })
  return toFlatComic(updated)
}

export async function removeComic(db, { userId, comicId }) {
  const result = await db.collection('comics').deleteOne({ _id: new ObjectId(comicId), userId })
  return result.deletedCount === 1
}

/**
 * Copy-on-write cover attach: points only the given account's comic at the
 * asset. Never mutates the asset itself or any other account's comic.
 */
export async function attachCoverAsset(db, { userId, comicId, assetId }) {
  const result = await db.collection('comics').updateOne(
    { _id: new ObjectId(comicId), userId },
    { $set: { coverAssetId: new ObjectId(assetId), hasCover: true, updatedAt: new Date().toISOString() } }
  )
  return result.matchedCount === 1
}

export async function detachCover(db, { userId, comicId }) {
  const result = await db.collection('comics').updateOne(
    { _id: new ObjectId(comicId), userId },
    { $set: { coverAssetId: null, hasCover: false, updatedAt: new Date().toISOString() } }
  )
  return result.matchedCount === 1
}
