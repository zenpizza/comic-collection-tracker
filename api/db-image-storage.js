/**
 * Database image storage utilities for MongoDB
 * This is a utility file, not a serverless endpoint
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

/**
 * Store cover images in MongoDB
 */
async function storeCoverImages(comicId, imageData, metadata = {}) {
  try {
    const database = await connectToDatabase()
    const collection = database.collection('cover_images')
    
    const document = {
      comicId,
      images: imageData,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    console.log(`[DB] Storing image for comicId: ${comicId}, type: ${typeof comicId}`)
    console.log(`[DB] imageData type: ${typeof imageData}, is object: ${typeof imageData === 'object'}`)
    console.log(`[DB] imageData keys:`, typeof imageData === 'object' ? Object.keys(imageData) : 'N/A')
    console.log(`[DB] Document structure:`, {
      comicId: document.comicId,
      imagesType: typeof document.images,
      imagesKeys: typeof document.images === 'object' ? Object.keys(document.images) : 'N/A',
      metadataKeys: Object.keys(document.metadata)
    })
    
    const result = await collection.replaceOne(
      { comicId },
      document,
      { upsert: true }
    )
    
    console.log(`[DB] Store result - matched: ${result.matchedCount}, modified: ${result.modifiedCount}, upserted: ${result.upsertedCount}`)
    
    // Verify the write by reading it back
    const verification = await collection.findOne({ 
      $or: [
        { comicId: comicId },
        { comicId: String(comicId) },
        { comicId: Number(comicId) }
      ]
    })
    
    if (!verification) {
      console.error(`[DB] WARNING: Could not verify write for comicId: ${comicId}`)
    } else {
      console.log(`[DB] Write verified for comicId: ${comicId}`)
    }
    
    return result.upsertedId || comicId
  } catch (error) {
    console.error('Error storing cover images:', error)
    throw error
  }
}

/**
 * Get cover images from MongoDB
 */
async function getCoverImages(comicId) {
  try {
    const database = await connectToDatabase()
    const collection = database.collection('cover_images')
    
    // Try to find by comicId (handle both string and number formats)
    const result = await collection.findOne({ 
      $or: [
        { comicId: comicId },
        { comicId: String(comicId) },
        { comicId: Number(comicId) }
      ]
    })
    
    if (!result) {
      console.log(`No image found for comicId: ${comicId} (tried string and number formats)`)
    } else {
      console.log(`Found image for comicId: ${comicId}`)
    }
    
    return result
  } catch (error) {
    console.error('Error getting cover images:', error)
    throw error
  }
}

/**
 * Delete cover images from MongoDB
 */
async function deleteCoverImages(comicId) {
  try {
    const database = await connectToDatabase()
    const collection = database.collection('cover_images')
    
    const result = await collection.deleteOne({ comicId })
    return result.deletedCount > 0
  } catch (error) {
    console.error('Error deleting cover images:', error)
    throw error
  }
}

export {
  connectToDatabase,
  storeCoverImages,
  getCoverImages,
  deleteCoverImages
}