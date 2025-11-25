/**
 * Bulk operations endpoint for comics
 * POST /api/comics/bulk - Bulk create/update comics
 */

import { MongoClient, ObjectId } from 'mongodb'

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
    const collection = database.collection('comics')
    
    // Separate comics into updates (have _id) and inserts (new comics)
    const operations = validComics.map(comic => {
      // Remove id field and handle _id separately
      const { _id, id, ...comicData } = comic
      
      // If comic has an _id, update it; otherwise insert new
      if (_id) {
        // Parse _id as ObjectId
        const objectId = typeof _id === 'string' && ObjectId.isValid(_id) && _id.length === 24
          ? new ObjectId(_id)
          : _id
        
        return {
          replaceOne: {
            filter: { _id: objectId },
            replacement: {
              ...comicData,
              updatedAt: new Date().toISOString()
            },
            upsert: true
          }
        }
      } else {
        // New comic - insert with auto-generated ObjectId
        return {
          insertOne: {
            document: {
              ...comicData,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          }
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
    console.error('Error in bulk operation:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to perform bulk operation',
      details: error.message
    })
  }
}