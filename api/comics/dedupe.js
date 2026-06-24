/**
 * Deduplication endpoint for comics
 * POST /api/comics/dedupe - Remove duplicate comic records
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'
import { listComics, removeComic } from '../lib/comics.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const database = await connectToDatabase()

    // The unique {userId, identityKey} index prevents new duplicates, but
    // legacy data (or a manual DB edit) could still have some — group by
    // identityKey within this account to find them.
    const allComics = await listComics(database, req.userId)
    console.log(`Found ${allComics.length} comics in this account's collection`)

    const comicGroups = {}
    const duplicates = []
    const unique = []

    allComics.forEach(comic => {
      const key = comic.identityKey
      if (!comicGroups[key]) {
        comicGroups[key] = []
      }
      comicGroups[key].push(comic)
    })

    Object.values(comicGroups).forEach(group => {
      if (group.length > 1) {
        const sorted = group.sort((a, b) => {
          // Prefer entries with notes (more likely to be the curated one)
          if (a.notes && !b.notes) return -1
          if (!a.notes && b.notes) return 1

          const dateA = new Date(a.dateAdded || a.createdAt || 0)
          const dateB = new Date(b.dateAdded || b.createdAt || 0)
          return dateB - dateA
        })

        unique.push(sorted[0])
        duplicates.push(...sorted.slice(1))
      } else {
        unique.push(group[0])
      }
    })

    console.log(`Found ${duplicates.length} duplicates to remove`)
    console.log(`Keeping ${unique.length} unique comics`)

    for (const duplicate of duplicates) {
      await removeComic(database, { userId: req.userId, comicId: duplicate.id })
    }

    return res.status(200).json({
      success: true,
      message: `Deduplication completed: ${duplicates.length} duplicates removed, ${unique.length} unique comics remaining`,
      stats: {
        totalBefore: allComics.length,
        duplicatesRemoved: duplicates.length,
        uniqueRemaining: unique.length,
        totalAfter: unique.length
      },
      duplicatesRemoved: duplicates.map(comic => ({
        id: comic.id,
        series: comic.series,
        issueNumber: comic.issueNumber,
        publisher: comic.publisher
      })).slice(0, 10) // Show first 10 for reference
    })

  } catch (error) {
    console.error('Deduplication error:', error)
    return res.status(500).json({
      success: false,
      error: 'Deduplication failed',
      details: error.message
    })
  }
}