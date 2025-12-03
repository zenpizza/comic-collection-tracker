/**
 * Comics API endpoint - handles all comic operations with MongoDB
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from './config.js'

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
    const collection = database.collection('comics')
    
    // Filter out comics with missing required fields
    const comics = await collection.find({
      series: { $exists: true, $ne: null, $ne: "" },
      issueNumber: { $exists: true, $ne: null, $ne: "" }
    }).toArray()
    
    // Additional client-side filtering and data normalization
    const validComics = comics
      .filter(comic => 
        comic.series && 
        comic.issueNumber !== undefined && 
        comic.issueNumber !== null &&
        comic.issueNumber !== ""
      )
      .map(comic => ({
        ...comic,
        // Convert ObjectId to string for frontend
        id: comic._id.toString(),
        // Ensure issueNumber is always a string for frontend compatibility
        issueNumber: String(comic.issueNumber),
        // Ensure series is always a string
        series: String(comic.series),
        // Ensure hasCover is a boolean (default to false if not set)
        hasCover: comic.hasCover === true
      }))
    
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
    const collection = database.collection('comics')
    
    // Normalize data types for consistency
    // Remove any existing _id or id to let MongoDB generate ObjectId
    const { _id, id, ...comicData } = comic
    
    const normalizedComic = {
      ...comicData,
      series: String(comic.series || ''),
      issueNumber: String(comic.issueNumber || ''),
      publisher: comic.publisher ? String(comic.publisher) : comic.publisher,
      year: comic.year && !isNaN(comic.year) ? Number(comic.year) : comic.year,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    // MongoDB will auto-generate ObjectId for _id
    const result = await collection.insertOne(normalizedComic)
    
    return res.status(201).json({
      success: true,
      comic: { 
        ...normalizedComic, 
        _id: result.insertedId,
        // Convert ObjectId to string for frontend
        id: result.insertedId.toString()
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