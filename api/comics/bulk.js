/**
 * Bulk operations endpoint for comics
 * POST /api/comics/bulk - Bulk create/update comics
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { getS3Client } from '../s3-client.js'
import { isS3Reference } from '../s3-serialization.js'
import { requireAuth } from '../auth.js'
import { upsertItem, listCollection, removeFromCollection, countCollectionsReferencing } from '../lib/userComics.js'
import { deleteCoverImages } from '../db-image-storage.js'

let client
let db

async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    client = new MongoClient(getMongoDBUri())
    await client.connect()
    db = client.db(getDatabaseName())
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method === 'DELETE') {
    return handleDeleteAll(req, res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { comics } = req.body

    if (!comics || !Array.isArray(comics)) {
      return res.status(400).json({
        success: false,
        error: 'Comics array is required'
      })
    }

    // Filter out invalid comics and normalize data types
    const validComics = comics
      .filter(comic =>
        comic &&
        comic.series &&
        comic.issueNumber !== undefined &&
        comic.issueNumber !== null &&
        comic.issueNumber !== ""
      )
      .map(comic => ({
        ...comic,
        // Normalize data types for consistency
        series: String(comic.series),
        issueNumber: String(comic.issueNumber),
        publisher: comic.publisher ? String(comic.publisher) : comic.publisher,
        year: comic.year && !isNaN(comic.year) ? Number(comic.year) : comic.year
      }))

    if (validComics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid comics to save'
      })
    }

    const database = await connectToDatabase()

    let upsertedCount = 0
    let modifiedCount = 0

    for (const comic of validComics) {
      const userComicId = comic.id || (comic._id ? String(comic._id) : null)
      await upsertItem(database, { userId: req.userId, userComicId, comic })

      if (userComicId) {
        modifiedCount++
      } else {
        upsertedCount++
      }
    }

    const invalidCount = comics.length - validComics.length

    return res.status(200).json({
      success: true,
      message: `Comics saved: ${upsertedCount} new, ${modifiedCount} updated${invalidCount > 0 ? `, ${invalidCount} invalid comics skipped` : ''}`,
      stats: {
        upserted: upsertedCount,
        modified: modifiedCount,
        matched: modifiedCount,
        invalid: invalidCount
      }
    })
  } catch (error) {
    console.error('Error in bulk operation:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to perform bulk operation',
      details: error.message
    })
  }
}

async function handleDeleteAll(req, res) {
  try {
    const { confirm } = req.body || {}

    if (confirm !== true) {
      return res.status(400).json({
        success: false,
        error: 'Must pass { confirm: true } to delete all comics'
      })
    }

    const database = await connectToDatabase()

    // Only this account's collection items are removed. Shared
    // metadata/covers are cleaned up only once no account references them.
    const items = await listCollection(database, req.userId)
    const s3Client = getS3Client()

    for (const item of items) {
      await removeFromCollection(database, { userId: req.userId, userComicId: item.id })

      const remainingReferences = await countCollectionsReferencing(database, item.comicMetadataId)
      if (remainingReferences === 0) {
        try {
          if (s3Client.isConfigured()) {
            await s3Client.deleteImages(item.comicMetadataId)
          }
          await deleteCoverImages(item.comicMetadataId)
        } catch (imageError) {
          console.warn(`[DeleteAll] Image cleanup warning for metadata ${item.comicMetadataId}:`, imageError.message)
        }
        await database.collection('comicMetadata').deleteOne({ _id: new ObjectId(item.comicMetadataId) })
      }
    }

    return res.status(200).json({
      success: true,
      message: `Deleted ${items.length} comics from your collection`,
      deletedCount: items.length
    })
  } catch (error) {
    console.error('Error deleting all comics:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to delete all comics',
      details: error.message
    })
  }
}