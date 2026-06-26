/**
 * Dynamic Image API endpoint
 * Handles all operations for a specific comic's cover image
 *
 * `comicId` here is the requesting account's own comic row id (not a
 * shared identifier) — ownership is verified via {_id, userId}, then the
 * comic's coverAssetId is resolved to find the actual stored bytes.
 *
 * Routes:
 * - GET /api/images/[comicId]?size=medium - Get image by size
 * - GET /api/images/[comicId]?metadata=true - Get metadata
 * - DELETE /api/images/[comicId] - Remove this account's cover (does not
 *   delete the underlying shared asset — see COM-45)
 */

import { MongoClient, ObjectId } from 'mongodb'
import { getCoverImages } from '../db-image-storage.js'
import { getMongoDBUri, getDatabaseName } from '../config.js'
import { isS3Reference, isLegacyReference } from '../s3-serialization.js'
import { requireAuth } from '../auth.js'
import { getComic, detachCover } from '../lib/comics.js'

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

    switch (req.method) {
      case 'GET':
        if (metadata === 'true') {
          return handleGetMetadata(req, res, assetId)
        } else if (size) {
          return handleGetImage(req, res, assetId, size)
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

async function handleGetImage(req, res, assetId, size) {
  try {
    // Validate size parameter
    const validSizes = ['thumbnail', 'medium', 'full']
    if (!validSizes.includes(size)) {
      return res.status(400).json({
        success: false,
        error: `Invalid size. Must be one of: ${validSizes.join(', ')}`
      })
    }

    console.log(`[Image API] Retrieving image for asset: ${assetId}, size: ${size}`)

    const imageData = await getCoverImages(assetId)

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

    // Check if this is an S3 reference (has url field). Proxy the bytes
    // through our own origin rather than redirecting — the browser's
    // authenticated fetch would carry our Authorization header into a
    // cross-origin request to CloudFront, which has no CORS policy for it
    // and fails preflight.
    if (isS3Reference(sizeData)) {
      console.log(`[Image API] Proxying S3/CloudFront image: ${sizeData.url}`)
      const cdnResponse = await fetch(sizeData.url)

      if (!cdnResponse.ok) {
        return res.status(cdnResponse.status).json({
          success: false,
          error: 'Failed to fetch image from storage'
        })
      }

      const imageBuffer = Buffer.from(await cdnResponse.arrayBuffer())
      res.setHeader('Content-Type', cdnResponse.headers.get('content-type') || 'image/jpeg')
      res.setHeader('Content-Length', imageBuffer.length)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.status(200).send(imageBuffer)
    }

    // Fall back to legacy base64 path
    if (isLegacyReference(sizeData)) {
      console.log(`[Image API] Serving legacy base64 image`)

      const imageBuffer = Buffer.from(sizeData.data, 'base64')

      res.setHeader('Content-Type', sizeData.mimeType || 'image/jpeg')
      res.setHeader('Content-Length', imageBuffer.length)
      res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year
      res.setHeader('ETag', `"${assetId}-${size}"`)

      console.log(`[Image API] Successfully serving ${sizeData.mimeType} image, ${imageBuffer.length} bytes`)

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

async function handleGetMetadata(req, res, assetId) {
  try {
    console.log(`[Image API] Retrieving metadata for asset: ${assetId}`)

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

    const clientETag = req.headers['if-none-match']
    if (clientETag === etag) {
      return res.status(304).end()
    }

    const metadata = {
      comicId: assetId,
      source: imageData.source || 'unknown',
      createdAt: imageData.createdAt,
      updatedAt: imageData.updatedAt,
      ...imageData.metadata
    }

    if (imageData.images && typeof imageData.images === 'object' && !Array.isArray(imageData.images) && !imageData.images.data) {
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
      const imageSize = Buffer.from(imageData.images, 'base64').length
      metadata.images = {
        thumbnail: { size: imageSize, mimeType: imageData.mimeType || 'image/jpeg', dimensions: { width: 0, height: 0 } },
        medium: { size: imageSize, mimeType: imageData.mimeType || 'image/jpeg', dimensions: { width: 0, height: 0 } },
        full: { size: imageSize, mimeType: imageData.mimeType || 'image/jpeg', dimensions: { width: 0, height: 0 } }
      }
    } else if (imageData.imageData) {
      const imageSize = Buffer.from(imageData.imageData, 'base64').length
      metadata.images = {
        medium: {
          size: imageSize,
          mimeType: imageData.mimeType || 'image/jpeg',
          dimensions: imageData.dimensions || { width: 0, height: 0 }
        }
      }
    }

    console.log(`[Image API] Successfully retrieved metadata for asset: ${assetId}`)

    return res.status(200).json({ success: true, metadata })

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
    console.log(`[Image API] Removing cover for comic: ${comicId}`)

    const database = await connectToDatabase()
    // Copy-on-write: only this account's pointer is cleared. The
    // underlying asset is left in place — other accounts may still
    // reference it, and GC is deferred (COM-45).
    await detachCover(database, { userId: req.userId, comicId })

    return res.status(200).json({
      success: true,
      message: 'Image removed successfully'
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
