/**
 * Deduplication endpoint for comics
 * POST /api/comics/dedupe - Remove duplicate comic records
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const database = await connectToDatabase()
    const collection = database.collection('comics')
    
    // Find all comics
    const allComics = await collection.find({}).toArray()
    console.log(`Found ${allComics.length} total comics`)

    // Group by series + issueNumber + publisher to find duplicates
    const comicGroups = {}
    const duplicates = []
    const unique = []

    allComics.forEach(comic => {
      // Create a key for deduplication
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

    console.log(`Found ${duplicates.length} duplicates to remove`)
    console.log(`Keeping ${unique.length} unique comics`)

    // Delete duplicates
    if (duplicates.length > 0) {
      const duplicateIds = duplicates.map(comic => comic._id)
      const deleteResult = await collection.deleteMany({
        _id: { $in: duplicateIds }
      })
      
      console.log(`Deleted ${deleteResult.deletedCount} duplicate records`)
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