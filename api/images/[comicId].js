/**
 * Dynamic Image API endpoint
 * Handles all operations for a specific comic's images
 * 
 * Routes:
 * - GET /api/images/[comicId]?size=medium - Get image by size
 * - GET /api/images/[comicId]?metadata=true - Get metadata
 * - DELETE /api/images/[comicId] - Delete image
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getCoverImages, deleteCoverImages } from '../db-image-storage.js'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { getS3Client } from '../s3-client.js'
import { isS3Reference, isLegacyReference } from '../s3-serialization.js'
import { requireAuth } from '../auth.js'
import { userOwnsMetadata } from '../lib/userComics.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  const { comicId, size, metadata } = req.query

  if (!comicId) {
    return res.status(400).json({
      success: false,
      error: 'Comic ID is required'
    })
  }

  try {
    const database = await connectToDatabase()
    const owned = ObjectId.isValid(comicId) &&
      await userOwnsMetadata(database, { userId: req.userId, comicMetadataId: comicId })
    if (!owned) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }

    switch (req.method) {
      case 'GET':
        if (metadata === 'true') {
          return handleGetMetadata(req, res, comicId)
        } else if (size) {
          return handleGetImage(req, res, comicId, size)
        } else {
          return res.status(400).json({
            success: false,
            error: 'Either size or metadata parameter is required'
          })
        }
      case 'DELETE':
        return handleDeleteImage(req, res, comicId)
      default:
        return res.status(405).json({ 
          success: false,
          error: 'Method not allowed' 
        })
    }
  } catch (error) {
    console.error('Image API Error:', error)
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

async function handleGetImage(req, res, comicId, size) {
  try {
    // Validate size parameter
    const validSizes = ['thumbnail', 'medium', 'full']
    if (!validSizes.includes(size)) {
      return res.status(400).json({
        success: false,
        error: `Invalid size. Must be one of: ${validSizes.join(', ')}`
      })
    }
    
    console.log(`[Image API] Retrieving image for comic: ${comicId}, size: ${size}`)
    
    // Get the image from MongoDB
    const imageData = await getCoverImages(comicId)
    
    if (!imageData) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }
    
    // Extract the specific size data
    let sizeData = null
    
    if (imageData.images && typeof imageData.images === 'object' && !Array.isArray(imageData.images) && imageData.images[size]) {
      // Multi-size format (object with size keys)
      sizeData = imageData.images[size]
    } else if (imageData.images && typeof imageData.images === 'string') {
      // Legacy format: images field is a base64 string (all sizes are the same)
      sizeData = {
        data: imageData.images,
        mimeType: imageData.mimeType || 'image/jpeg'
      }
    } else if (imageData.imageData) {
      // Another legacy format: imageData field
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
    
    // Check if this is an S3 reference (has url field) - redirect to CloudFront
    if (isS3Reference(sizeData)) {
      console.log(`[Image API] Redirecting to S3/CloudFront: ${sizeData.url}`)
      res.setHeader('Location', sizeData.url)
      res.setHeader('Cache-Control', 'public, max-age=86400') // Cache redirect for 1 day
      return res.status(302).end()
    }
    
    // Fall back to legacy base64 path
    if (isLegacyReference(sizeData)) {
      console.log(`[Image API] Serving legacy base64 image`)
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(sizeData.data, 'base64')
      
      // Set appropriate headers
      res.setHeader('Content-Type', sizeData.mimeType || 'image/jpeg')
      res.setHeader('Content-Length', imageBuffer.length)
      res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year
      res.setHeader('ETag', `"${comicId}-${size}"`)
      
      console.log(`[Image API] Successfully serving ${sizeData.mimeType} image, ${imageBuffer.length} bytes`)
      
      // Send the image
      return res.status(200).send(imageBuffer)
    }
    
    // Neither S3 nor legacy reference found
    return res.status(404).json({
      success: false,
      error: `No valid image data found for size '${size}'`
    })
    
  } catch (error) {
    console.error('[Image API] Image retrieval error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve image',
      details: error.message
    })
  }
}

async function handleGetMetadata(req, res, comicId) {
  try {
    console.log(`[Image API] Retrieving metadata for comic: ${comicId}`)
    
    // Get the image metadata from MongoDB
    const imageData = await getCoverImages(comicId)
    
    if (!imageData) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }
    
    // Set cache headers that include updatedAt in ETag to bust cache on updates
    // Use must-revalidate to ensure browser checks with server
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
    
    // Include updatedAt timestamp in ETag so cache is invalidated when image is replaced
    const etag = `"${comicId}-metadata-${imageData.updatedAt || Date.now()}"`
    res.setHeader('ETag', etag)
    
    // Check if client has current version
    const clientETag = req.headers['if-none-match']
    if (clientETag === etag) {
      return res.status(304).end()
    }
    
    // Build metadata response
    const metadata = {
      comicId,
      source: imageData.source || 'unknown',
      createdAt: imageData.createdAt,
      updatedAt: imageData.updatedAt,
      ...imageData.metadata
    }
    
    // Add size information if available
    if (imageData.images && typeof imageData.images === 'object' && !Array.isArray(imageData.images) && !imageData.images.data) {
      // Multi-size format (object with size keys)
      metadata.images = {}
      for (const [size, sizeData] of Object.entries(imageData.images)) {
        if (typeof sizeData === 'object') {
          metadata.images[size] = {
            size: sizeData.size || 0,
            mimeType: sizeData.mimeType,
            dimensions: sizeData.dimensions || { width: 0, height: 0 }
          }
        }
      }
    } else if (imageData.images && typeof imageData.images === 'string') {
      // Legacy format: images field is a base64 string
      const imageSize = Buffer.from(imageData.images, 'base64').length
      metadata.images = {
        thumbnail: { size: imageSize, mimeType: imageData.mimeType || 'image/jpeg', dimensions: { width: 0, height: 0 } },
        medium: { size: imageSize, mimeType: imageData.mimeType || 'image/jpeg', dimensions: { width: 0, height: 0 } },
        full: { size: imageSize, mimeType: imageData.mimeType || 'image/jpeg', dimensions: { width: 0, height: 0 } }
      }
    } else if (imageData.imageData) {
      // Another legacy format: imageData field
      const imageSize = Buffer.from(imageData.imageData, 'base64').length
      metadata.images = {
        medium: {
          size: imageSize,
          mimeType: imageData.mimeType || 'image/jpeg',
          dimensions: imageData.dimensions || { width: 0, height: 0 }
        }
      }
    }
    
    console.log(`[Image API] Successfully retrieved metadata for comic: ${comicId}`)
    
    return res.status(200).json({
      success: true,
      metadata
    })
    
  } catch (error) {
    console.error('[Image API] Metadata retrieval error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve metadata',
      details: error.message
    })
  }
}

async function handleDeleteImage(req, res, comicId) {
  try {
    console.log(`[Image API] Deleting image for comic: ${comicId}`)
    
    // First, get the existing cover to check if it has S3 references
    const existingCover = await getCoverImages(comicId)
    
    if (!existingCover) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }
    
    // Check if any size has S3 references
    const hasS3Refs = existingCover.images && 
      Object.values(existingCover.images).some(img => isS3Reference(img))
    
    // Delete from S3 first (if configured and has S3 refs)
    const s3Client = getS3Client()
    let s3DeleteSuccess = true
    
    if (s3Client.isConfigured() && hasS3Refs) {
      try {
        console.log(`[Image API] Deleting S3 objects for comic: ${comicId}`)
        await s3Client.deleteImages(comicId)
        console.log(`[Image API] S3 deletion successful for comic: ${comicId}`)
      } catch (s3Error) {
        // Log but continue - S3 deletion is idempotent
        console.warn(`[Image API] S3 deletion warning for comic ${comicId}:`, s3Error.message)
        s3DeleteSuccess = false
      }
    }
    
    // Delete from MongoDB
    let mongoDeleteSuccess = false
    try {
      mongoDeleteSuccess = await deleteCoverImages(comicId)
    } catch (mongoError) {
      // If MongoDB deletion fails after S3 deletion, log orphaned keys
      if (s3DeleteSuccess && hasS3Refs) {
        console.error(`[Image API] ORPHANED S3 KEYS - MongoDB deletion failed after S3 deletion for comic: ${comicId}`)
        console.error(`[Image API] Orphaned keys: covers/${comicId}/*`)
      }
      throw mongoError
    }
    
    // Update the shared metadata's hasCover flag
    try {
      const database = await connectToDatabase()

      if (ObjectId.isValid(comicId) && comicId.length === 24) {
        await database.collection('comicMetadata').updateOne(
          { _id: new ObjectId(comicId) },
          { $set: { hasCover: false, coverLastUpdated: new Date().toISOString() } }
        )
        console.log(`[Image API] Updated hasCover flag to false for metadata: ${comicId}`)
      }
    } catch (error) {
      console.warn(`[Image API] Failed to update hasCover flag:`, error.message)
      // Don't fail the delete if this fails
    }
    
    return res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    })
    
  } catch (error) {
    console.error('[Image API] Image deletion error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to delete image',
      details: error.message
    })
  }
}