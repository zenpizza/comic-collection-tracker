/**
 * Image Metadata API endpoint
 * GET /api/images/[comicId]/metadata
 * 
 * Retrieves image metadata from MongoDB storage.
 * Returns S3/CloudFront URLs when available.
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getCoverImages } from '../../db-image-storage.js'
import { isS3Reference, isLegacyReference } from '../../s3-serialization.js'
import { requireAuth } from '../../auth.js'
import { getMongoDBUri, getDatabaseName } from '../../config.js'
import { getComic } from '../../lib/comics.js'

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
    const { comicId } = req.query
    
    if (!comicId) {
      return res.status(400).json({
        success: false,
        error: 'Missing comicId parameter'
      })
    }
    
    const database = await connectToDatabase()
    const comic = ObjectId.isValid(comicId)
      ? await getComic(database, { userId: req.userId, comicId })
      : null
    if (!comic || !comic.coverAssetId) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }
    const assetId = comic.coverAssetId

    console.log(`[Metadata API] Retrieving metadata for asset: ${assetId}`)

    // Get the image metadata from MongoDB
    const imageData = await getCoverImages(assetId)

    if (!imageData) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      })
    }

    // Set cache headers that include updatedAt in ETag to bust cache on updates
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')

    const etag = `"${assetId}-metadata-${imageData.updatedAt || Date.now()}"`
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
    
    // Add size information with S3 URLs when available
    if (imageData.images) {
      metadata.images = {}
      
      for (const [size, sizeData] of Object.entries(imageData.images)) {
        if (isS3Reference(sizeData)) {
          // S3 reference - include URL and S3 metadata
          metadata.images[size] = {
            url: sizeData.url,
            key: sizeData.key,
            contentType: sizeData.contentType,
            size: sizeData.size || 0,
            etag: sizeData.etag,
            uploadedAt: sizeData.uploadedAt,
            storageType: 'S3'
          }
        } else if (isLegacyReference(sizeData)) {
          // Legacy base64 reference
          metadata.images[size] = {
            size: sizeData.size || 0,
            mimeType: sizeData.mimeType,
            dimensions: sizeData.dimensions || { width: 0, height: 0 },
            storageType: 'MongoDB'
          }
        } else {
          // Unknown format
          metadata.images[size] = {
            size: sizeData.size || 0,
            mimeType: sizeData.mimeType,
            storageType: 'unknown'
          }
        }
      }
    } else if (imageData.imageData) {
      // Legacy single-size format
      metadata.images = {
        medium: {
          size: imageData.size || 0,
          mimeType: imageData.mimeType || 'image/jpeg',
          dimensions: imageData.dimensions || { width: 0, height: 0 },
          storageType: 'MongoDB'
        }
      }
    }
    
    // Add migration status if available
    if (imageData.migratedAt) {
      metadata.migratedAt = imageData.migratedAt
    }
    if (imageData.legacyRemoved) {
      metadata.legacyRemoved = imageData.legacyRemoved
    }
    
    console.log(`[Metadata API] Successfully retrieved metadata for comic: ${comicId}`)
    
    return res.status(200).json({
      success: true,
      metadata
    })
    
  } catch (error) {
    console.error('[Metadata API] Error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve metadata',
      details: error.message
    })
  }
}
