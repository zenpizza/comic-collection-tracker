/**
 * Bulk operations endpoint for comics
 * POST /api/comics/bulk - Bulk create/update comics
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'
import { addComic, updateComic, DuplicateComicError } from '../lib/comics.js'

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
    let duplicateCount = 0

    for (const comic of validComics) {
      const comicId = comic.id || (comic._id ? String(comic._id) : null)

      try {
        if (comicId) {
          await updateComic(database, { userId: req.userId, comicId, updates: comic })
          modifiedCount++
        } else {
          await addComic(database, { userId: req.userId, comic })
          upsertedCount++
        }
      } catch (error) {
        if (error instanceof DuplicateComicError) {
          duplicateCount++
          continue
        }
        // An imported comic carries an id from the source account — if that
        // id doesn't exist in this account, treat it as a new insert rather
        // than failing the whole import with a 500.
        if (comicId && error.message?.includes('not found')) {
          try {
            const { id: _dropped, _id: _dropped2, ...comicWithoutId } = comic
            await addComic(database, { userId: req.userId, comic: comicWithoutId })
            upsertedCount++
            continue
          } catch (addError) {
            if (addError instanceof DuplicateComicError) {
              duplicateCount++
              continue
            }
            throw addError
          }
        }
        throw error
      }
    }

    const invalidCount = comics.length - validComics.length

    return res.status(200).json({
      success: true,
      message: `Comics saved: ${upsertedCount} new, ${modifiedCount} updated${duplicateCount > 0 ? `, ${duplicateCount} duplicates skipped` : ''}${invalidCount > 0 ? `, ${invalidCount} invalid comics skipped` : ''}`,
      stats: {
        upserted: upsertedCount,
        modified: modifiedCount,
        matched: modifiedCount,
        duplicate: duplicateCount,
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

    // Only this account's rows are removed. Shared cover assets are
    // intentionally left in place — see COM-45 (GC deferred).
    const result = await database.collection('comics').deleteMany({ userId: req.userId })

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} comics from your collection`,
      deletedCount: result.deletedCount
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
