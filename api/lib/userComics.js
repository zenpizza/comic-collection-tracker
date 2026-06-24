import { ObjectId } from 'mongodb'
import { findOrCreateComicMetadata } from './comicMetadata.js'

const CANONICAL_FIELDS = ['series', 'issueNumber', 'publisher', 'year', 'variant', 'volumeId', 'volumeName']

function toFlatItem(item, metadata) {
  return {
    id: item._id.toString(),
    comicMetadataId: metadata._id.toString(),
    series: metadata.series,
    issueNumber: metadata.issueNumber,
    publisher: metadata.publisher,
    year: metadata.year,
    variant: metadata.variant,
    volumeId: metadata.volumeId,
    volumeName: metadata.volumeName,
    hasCover: metadata.hasCover,
    coverLastUpdated: metadata.coverLastUpdated,
    notes: item.notes,
    dateAdded: item.dateAdded,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

/**
 * Per-account collection — references shared comicMetadata plus the
 * account's own personal fields (notes, dateAdded).
 */
export async function addToCollection(db, { userId, comicMetadataId, notes, dateAdded }) {
  const collection = db.collection('userComics')
  const now = new Date().toISOString()

  const doc = {
    userId,
    comicMetadataId: new ObjectId(comicMetadataId),
    notes: notes || '',
    dateAdded: dateAdded || now,
    createdAt: now,
    updatedAt: now,
  }

  const result = await collection.insertOne(doc)
  return { ...doc, _id: result.insertedId }
}

export async function listCollection(db, userId) {
  const collection = db.collection('userComics')

  const items = await collection
    .aggregate([
      { $match: { userId } },
      {
        $lookup: {
          from: 'comicMetadata',
          localField: 'comicMetadataId',
          foreignField: '_id',
          as: 'metadata',
        },
      },
      { $unwind: '$metadata' },
    ])
    .toArray()

  return items.map((item) => toFlatItem(item, item.metadata))
}

export async function removeFromCollection(db, { userId, userComicId }) {
  const collection = db.collection('userComics')
  const result = await collection.deleteOne({ _id: new ObjectId(userComicId), userId })
  return result.deletedCount === 1
}

export async function getCollectionItem(db, { userId, userComicId }) {
  const collection = db.collection('userComics')
  return collection.findOne({ _id: new ObjectId(userComicId), userId })
}

export async function updatePersonalFields(db, { userId, userComicId, notes, dateAdded }) {
  const collection = db.collection('userComics')
  const update = { updatedAt: new Date().toISOString() }
  if (notes !== undefined) update.notes = notes
  if (dateAdded !== undefined) update.dateAdded = dateAdded

  const result = await collection.updateOne(
    { _id: new ObjectId(userComicId), userId },
    { $set: update }
  )
  return result.matchedCount === 1
}

export async function relinkComicMetadata(db, { userId, userComicId, comicMetadataId }) {
  const collection = db.collection('userComics')
  const result = await collection.updateOne(
    { _id: new ObjectId(userComicId), userId },
    { $set: { comicMetadataId: new ObjectId(comicMetadataId), updatedAt: new Date().toISOString() } }
  )
  return result.matchedCount === 1
}

export async function countCollectionsReferencing(db, comicMetadataId) {
  const collection = db.collection('userComics')
  return collection.countDocuments({ comicMetadataId: new ObjectId(comicMetadataId) })
}

export async function userOwnsMetadata(db, { userId, comicMetadataId }) {
  const collection = db.collection('userComics')
  const match = await collection.findOne({ userId, comicMetadataId: new ObjectId(comicMetadataId) })
  return match !== null
}

/**
 * Create-or-update a single collection item for an account. If userComicId
 * is omitted, a new metadata record (find-or-create) and collection item
 * are created. If it's provided, canonical-field edits relink to a
 * (possibly new) shared metadata record rather than mutating it in place,
 * and personal-field edits (notes, dateAdded) update the item directly.
 */
export async function upsertItem(db, { userId, userComicId, comic }) {
  if (!userComicId) {
    const metadata = await findOrCreateComicMetadata(db, comic)
    const item = await addToCollection(db, {
      userId,
      comicMetadataId: metadata._id,
      notes: comic.notes,
      dateAdded: comic.dateAdded,
    })
    return toFlatItem(item, metadata)
  }

  const existing = await getCollectionItem(db, { userId, userComicId })
  if (!existing) {
    throw new Error('Comic not found in this account\'s collection')
  }

  let metadata = await db.collection('comicMetadata').findOne({ _id: existing.comicMetadataId })

  const hasCanonicalEdit = CANONICAL_FIELDS.some((field) => field in comic)
  if (hasCanonicalEdit) {
    const merged = { ...metadata }
    CANONICAL_FIELDS.forEach((field) => {
      if (field in comic) merged[field] = comic[field]
    })

    metadata = await findOrCreateComicMetadata(db, merged)
    await relinkComicMetadata(db, { userId, userComicId, comicMetadataId: metadata._id })
  }

  await updatePersonalFields(db, { userId, userComicId, notes: comic.notes, dateAdded: comic.dateAdded })

  const updated = await getCollectionItem(db, { userId, userComicId })
  return toFlatItem(updated, metadata)
}
