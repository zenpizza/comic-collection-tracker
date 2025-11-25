/**
 * Data normalization endpoint for comics
 * POST /api/comics/normalize - Fix data type inconsistencies and remove duplicates
 */

import { MongoClient } from 'mongodb'

let client
let db

async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    client = new MongoClient(process.env.MONGODB_URI)
    await client.connect()
    db = client.db('comic-collection')
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    // Find all comics that need normalization
    const allComics = await collection.find({}).toArray()
    console.log(`Found ${allComics.length} total comics to check`)

    let normalizedCount = 0
    const operations = []

    allComics.forEach(comic => {
      let needsUpdate = false
      const updates = {}

      // Normalize ID to number (if it's a valid numeric string)
      if (comic.id !== undefined && comic.id !== null) {
        const currentType = typeof comic.id
        if (currentType === 'string' && !isNaN(comic.id) && !isNaN(parseFloat(comic.id))) {
          const numericId = Number(comic.id)
          if (Number.isSafeInteger(numericId) && numericId !== comic.id) {
            updates.id = numericId
            needsUpdate = true
          }
        }
      }

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

    // Now run deduplication after normalization
    console.log('Running deduplication after normalization...')
    
    // Re-fetch all comics after normalization
    const normalizedComics = await collection.find({}).toArray()
    
    // Group by series + issueNumber + publisher to find duplicates
    const comicGroups = {}
    const duplicates = []
    const unique = []

    normalizedComics.forEach(comic => {
      // Create a key for deduplication (now all fields should be strings)
      const key = `${String(comic.series || '').toLowerCase().trim()}|${String(comic.issueNumber || '').toLowerCase().trim()}|${String(comic.publisher || '').toLowerCase().trim()}`
      
      if (!comicGroups[key]) {
        comicGroups[key] = []
      }
      comicGroups[key].push(comic)
    })

    // Process each group
    Object.values(comicGroups).forEach(group => {
      if (group.length > 1) {
        // Keep the most recent one (by _id or dateAdded)
        const sorted = group.sort((a, b) => {
          // Prefer comics with covers
          if (a.hasCover && !b.hasCover) return -1
          if (!a.hasCover && b.hasCover) return 1
          
          // Then by date added (most recent first)
          const dateA = new Date(a.dateAdded || a.createdAt || 0)
          const dateB = new Date(b.dateAdded || b.createdAt || 0)
          return dateB - dateA
        })
        
        unique.push(sorted[0]) // Keep the first (best) one
        duplicates.push(...sorted.slice(1)) // Mark the rest as duplicates
      } else {
        unique.push(group[0]) // Single comic, keep it
      }
    })

    console.log(`Found ${duplicates.length} duplicates to remove after normalization`)

    // Delete duplicates
    let deleteResult = null
    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map(comic => comic._id)
      deleteResult = await collection.deleteMany({
        _id: { $in: duplicateIds }
      })
      
      console.log(`Deleted ${deleteResult.deletedCount} duplicate records`)
    }

    return res.status(200).json({
      success: true,
      message: `Data normalization completed: ${normalizedCount} records normalized, ${duplicates.length} duplicates removed`,
      stats: {
        totalRecords: allComics.length,
        recordsNormalized: normalizedCount,
        duplicatesRemoved: duplicates.length,
        finalCount: unique.length
      },
      normalizationDetails: updateResult ? {
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount
      } : null,
      deduplicationDetails: deleteResult ? {
        deleted: deleteResult.deletedCount
      } : null,
      sampleDuplicatesRemoved: duplicates.map(comic => ({
        id: comic.id,
        series: comic.series,
        issueNumber: comic.issueNumber,
        publisher: comic.publisher,
        originalIssueNumberType: typeof comic.issueNumber
      })).slice(0, 5) // Show first 5 for reference
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