/**
 * Dynamic Image Retrieval API endpoint
 * GET /api/images/[comicId]/[size]
 * 
 * Retrieves images by comicId and size.
 * - If S3 URL is available: returns 302 redirect to CloudFront URL
 * - If legacy base64 data: serves image from MongoDB
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getCoverImages } from '../../db-image-storage.js'
import { isS3Reference, isLegacyReference } from '../../s3-serialization.js'
import { requireAuth } from '../../auth.js'
import { getMongoDBUri, getDatabaseName } from '../../config.js'
import { userOwnsMetadata } from '../../lib/userComics.js'

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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    })
  }

  try {
    const { comicId, size } = req.query
    
    if (!comicId || !size) {
      return res.status(400).json({
        success: false,
        error: 'Missing comicId or size parameter'
      })
    }
    
    // Validate size parameter
    const validSizes = ['thumbnail', 'medium', 'full']
    if (!validSizes.includes(size)) {
      return res.status(400).json({
        success: false,
        error: `Invalid size. Must be one of: ${validSizes.join(', ')}`
      })
    }
    
    const database = await connectToDatabase()
    const owned = ObjectId.isValid(comicId) &&
      await userOwnsMetadata(database, { userId: req.userId, comicMetadataId: comicId })
    if (!owned) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }

    console.log(`[Image Retrieval] Retrieving image for comic: ${comicId}, size: ${size}`)

    // Get the image data from MongoDB
    const imageData = await getCoverImages(comicId)
    
    if (!imageData) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }
    
    // Extract the specific size data
    let sizeData = null
    
    if (imageData.images && imageData.images[size]) {
      sizeData = imageData.images[size]
    } else if (size === 'medium' && imageData.imageData) {
      // Legacy single-size format (assume medium)
      sizeData = {
        data: imageData.imageData,
        mimeType: imageData.mimeType || 'image/jpeg'
      }
    }
    
    if (!sizeData) {
      return res.status(404).json({
        success: false,
        error: `Size '${size}' not available for this image`
      })
    }
    
    // Check if this is an S3 reference (has url field)
    if (isS3Reference(sizeData)) {
      console.log(`[Image Retrieval] Redirecting to S3/CloudFront: ${sizeData.url}`)
      
      // Return 302 redirect to CloudFront URL
      res.setHeader('Location', sizeData.url)
      res.setHeader('Cache-Control', 'public, max-age=86400') // Cache redirect for 1 day
      return res.status(302).end()
    }
    
    // Fall back to legacy base64 path
    if (isLegacyReference(sizeData)) {
      console.log(`[Image Retrieval] Serving legacy base64 image`)
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(sizeData.data, 'base64')
      
      // Generate ETag with updatedAt timestamp for cache invalidation
      const updatedAt = imageData.updatedAt || imageData.createdAt || Date.now()
      const etag = `"${comicId}-${size}-${new Date(updatedAt).getTime()}"`
      
      // Set appropriate headers
      res.setHeader('Content-Type', sizeData.mimeType || 'image/jpeg')
      res.setHeader('Content-Length', imageBuffer.length)
      res.setHeader('Cache-Control', 'public, max-age=3600') // Cache for 1 hour
      res.setHeader('ETag', etag)
      res.setHeader('Last-Modified', new Date(updatedAt).toUTCString())
      
      console.log(`[Image Retrieval] Serving ${sizeData.mimeType} image, ${imageBuffer.length} bytes`)
      
      return res.status(200).send(imageBuffer)
    }
    
    // Neither S3 nor legacy reference found
    return res.status(404).json({
      success: false,
      error: `No valid image data found for size '${size}'`
    })
    
  } catch (error) {
    console.error('[Image Retrieval] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve image',
      details: error.message
    })
  }
}
