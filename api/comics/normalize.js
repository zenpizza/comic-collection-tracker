/**
 * Data normalization endpoint for comics
 * POST /api/comics/normalize - Fix data type inconsistencies and remove duplicates
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { requireAuth } from '../auth.js'

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
    const collection = database.collection('comics')

    const allComics = await collection.find({ userId: req.userId }).toArray()
    console.log(`Found ${allComics.length} comics in this account's collection to check`)

    let normalizedCount = 0
    const operations = []

    allComics.forEach(comic => {
      let needsUpdate = false
      const updates = {}

      // Normalize issueNumber to string
      if (comic.issueNumber !== undefined && comic.issueNumber !== null) {
        const normalizedIssueNumber = String(comic.issueNumber)
        if (comic.issueNumber !== normalizedIssueNumber) {
          updates.issueNumber = normalizedIssueNumber
          needsUpdate = true
        }
      }

      // Normalize series to string
      if (comic.series !== undefined && comic.series !== null) {
        const normalizedSeries = String(comic.series)
        if (comic.series !== normalizedSeries) {
          updates.series = normalizedSeries
          needsUpdate = true
        }
      }

      // Normalize publisher to string (if it exists)
      if (comic.publisher !== undefined && comic.publisher !== null) {
        const normalizedPublisher = String(comic.publisher)
        if (comic.publisher !== normalizedPublisher) {
          updates.publisher = normalizedPublisher
          needsUpdate = true
        }
      }

      // Normalize year to number (if it's a valid year string)
      if (comic.year !== undefined && comic.year !== null && comic.year !== '') {
        const currentType = typeof comic.year
        if (currentType === 'string' && !isNaN(comic.year) && !isNaN(parseFloat(comic.year))) {
          const numericYear = Number(comic.year)
          // Validate it's a reasonable year (1900-2100)
          if (Number.isInteger(numericYear) && numericYear >= 1900 && numericYear <= 2100 && numericYear !== comic.year) {
            updates.year = numericYear
            needsUpdate = true
          }
        }
      }

      if (needsUpdate) {
        operations.push({
          updateOne: {
            filter: { _id: comic._id },
            update: { 
              $set: {
                ...updates,
                updatedAt: new Date().toISOString()
              }
            }
          }
        })
        normalizedCount++
      }
    })

    console.log(`Found ${normalizedCount} comics that need normalization`)

    // Execute bulk update if there are operations
    let updateResult = null
    if (operations.length > 0) {
      updateResult = await collection.bulkWrite(operations)
      console.log(`Updated ${updateResult.modifiedCount} records`)
    }

    // Note: deduplication is no longer run here. The unique
    // {userId, identityKey} index prevents new duplicates at write time;
    // any pre-existing duplicates are handled by POST /api/comics/dedupe.

    return res.status(200).json({
      success: true,
      message: `Data normalization completed: ${normalizedCount} records normalized`,
      stats: {
        totalRecords: allComics.length,
        recordsNormalized: normalizedCount
      },
      normalizationDetails: updateResult ? {
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount
      } : null
    })

  } catch (error) {
    console.error('Data normalization error:', error)
    return res.status(500).json({
      success: false,
      error: 'Data normalization failed',
      details: error.message
    })
  }
}