/**
 * Comics API endpoint - handles all comic operations with MongoDB
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from './config.js'
import { requireAuth } from './auth.js'
import { getOrCreateAccount } from './lib/accounts.js'
import { findOrCreateComicMetadata } from './lib/comicMetadata.js'
import { addToCollection, listCollection } from './lib/userComics.js'

let client
let db

/**
 * Connect to MongoDB database
 */
async function connectToDatabase() {
  if (db) {
    return db
  }

  try {
    const uri = getMongoDBUri()
    const dbName = getDatabaseName()
    
    client = new MongoClient(uri)
    await client.connect()
    db = client.db(dbName)
    
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  try {
    switch (req.method) {
      case 'GET':
        return handleGetComics(req, res)
      case 'POST':
        return handleCreateComic(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Comics API Error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

async function handleGetComics(req, res) {
  try {
    const database = await connectToDatabase()

    // Lazily create the account record on first authenticated request
    await getOrCreateAccount(database, { userId: req.userId, email: req.userEmail })

    const validComics = await listCollection(database, req.userId)

    return res.status(200).json({
      success: true,
      comics: validComics
    })
  } catch (error) {
    console.error('Error fetching comics:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch comics',
      details: error.message
    })
  }
}

async function handleSaveComics(req, res) {
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
        comic.issueNumber !== "" &&
        comic.id
      )
      .map(comic => ({
        ...comic,
        // Normalize data types for consistency
        series: String(comic.series),
        issueNumber: String(comic.issueNumber),
        publisher: comic.publisher ? String(comic.publisher) : comic.publisher
      }))

    if (validComics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid comics to save'
      })
    }

    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    // Use simple upsert by id only to prevent complex matching issues
    const operations = validComics.map(comic => {
      // Remove MongoDB _id field to prevent immutable field error
      const { _id, ...comicWithoutId } = comic
      
      return {
        replaceOne: {
          filter: { id: comic.id },
          replacement: {
            ...comicWithoutId,
            updatedAt: new Date().toISOString()
          },
          upsert: true
        }
      }
    })
    
    const result = await collection.bulkWrite(operations)
    
    const invalidCount = comics.length - validComics.length
    
    return res.status(200).json({
      success: true,
      message: `Comics saved to MongoDB: ${result.upsertedCount} new, ${result.modifiedCount} updated${invalidCount > 0 ? `, ${invalidCount} invalid comics skipped` : ''}`,
      stats: {
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        matched: result.matchedCount,
        invalid: invalidCount
      }
    })
  } catch (error) {
    console.error('Error saving comics:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to save comics',
      details: error.message
    })
  }
}

async function handleCreateComic(req, res) {
  try {
    const comic = req.body
    
    if (!comic) {
      return res.status(400).json({
        success: false,
        error: 'Comic data is required'
      })
    }

    const database = await connectToDatabase()

    const metadata = await findOrCreateComicMetadata(database, {
      series: comic.series,
      issueNumber: comic.issueNumber,
      publisher: comic.publisher,
      year: comic.year,
      variant: comic.variant,
      volumeId: comic.volumeId,
      volumeName: comic.volumeName,
    })

    const item = await addToCollection(database, {
      userId: req.userId,
      comicMetadataId: metadata._id,
      notes: comic.notes,
      dateAdded: comic.dateAdded,
    })

    return res.status(201).json({
      success: true,
      comic: {
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
      },
      message: 'Comic created successfully'
    })
  } catch (error) {
    console.error('Error creating comic:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to create comic',
      details: error.message
    })
  }
}

// Removed old handler functions - now using dedicated RESTful endpoints:
// - Individual operations: /api/comics/[id]
// - Bulk operations: /api/comics/bulk  
// - Statistics: /api/comics/stats
// - Deduplication: /api/comics/dedupe
// - Normalization: /api/comics/normalize