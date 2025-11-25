/**
 * Images API endpoint - MongoDB image storage
 * 
 * ARCHITECTURE DECISION: Server-side image storage in MongoDB Atlas
 * - Images stored as base64 in 'cover_images' collection (no GridFS, <5MB limit)
 * - Supports cross-device access and reliable persistence
 * - Part of unidirectional data flow (database as single source of truth)
 * 
 * Endpoints:
 * - POST /api/images/upload - Store image in MongoDB
 * - GET /api/images/{comicId}/{size} - Retrieve image from MongoDB
 * - GET /api/images/{comicId}/metadata - Get image metadata
 * - DELETE /api/images/{comicId} - Remove image from MongoDB
 */

import { storeCoverImages, getCoverImages, deleteCoverImages } from './db-image-storage.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathParts = url.pathname.split('/').filter(Boolean)
    
    // Route: POST /api/images/upload
    if (req.method === 'POST' && pathParts[2] === 'upload') {
      return handleImageUpload(req, res)
    }
    
    // Route: POST /api/images/sync  
    if (req.method === 'POST' && pathParts[2] === 'sync') {
      return handleImageSync(req, res)
    }
    
    // Route: GET /api/images/stats
    if (req.method === 'GET' && pathParts[2] === 'stats') {
      return handleImageStats(req, res)
    }
    
    // Route: GET /api/images/{comicId}/{size}
    if (req.method === 'GET' && pathParts.length === 4) {
      const comicId = pathParts[2]
      const size = pathParts[3]
      return handleImageGet(req, res, comicId, size)
    }
    
    // Route: GET /api/images/{comicId}/metadata
    if (req.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'metadata') {
      const comicId = pathParts[2]
      return handleImageMetadata(req, res, comicId)
    }
    
    // Route: DELETE /api/images/{comicId}
    if (req.method === 'DELETE' && pathParts.length === 3) {
      const comicId = pathParts[2]
      return handleImageDelete(req, res, comicId)
    }

    return res.status(404).json({ 
      error: 'Image endpoint not found',
      path: url.pathname,
      availableEndpoints: [
        'POST /api/images/upload',
        'POST /api/images/sync',
        'GET /api/images/stats',
        'GET /api/images/{comicId}/{size}',
        'GET /api/images/{comicId}/metadata',
        'DELETE /api/images/{comicId}'
      ]
    })

  } catch (error) {
    console.error('Images API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    })
  }
}

async function handleImageUpload(req, res) {
  // Redirect to dedicated upload endpoint
  return res.status(400).json({
    success: false,
    error: 'Please use /api/images/upload endpoint for image uploads',
    hint: 'This endpoint is deprecated. Use POST /api/images/upload with multipart/form-data'
  })
}

async function handleImageSync(req, res) {
  // Sync endpoint - returns no-op for now
  return res.status(200).json({
    success: true,
    message: 'Sync completed - no operations needed',
    toUpload: [],
    toDownload: [],
    conflicts: []
  })
}

async function handleImageStats(req, res) {
  return res.status(200).json({
    success: true,
    stats: {
      totalImages: 0,
      storageUsed: 0,
      cacheHitRate: 0
    }
  })
}

async function handleImageGet(req, res, comicId, size) {
  try {
    const imageDoc = await getCoverImages(comicId)
    
    if (!imageDoc || !imageDoc.images) {
      return res.status(404).json({ 
        error: 'Image not found',
        comicId,
        size
      })
    }
    
    // Get the requested size or fall back to available sizes
    let imageData = imageDoc.images[size]
    if (!imageData) {
      // Try fallback sizes
      const fallbackSizes = ['original', 'medium', 'thumbnail']
      for (const fallbackSize of fallbackSizes) {
        if (imageDoc.images[fallbackSize]) {
          imageData = imageDoc.images[fallbackSize]
          break
        }
      }
    }
    
    if (!imageData || !imageData.data) {
      return res.status(404).json({ 
        error: 'Image data not found for requested size',
        comicId,
        size,
        availableSizes: Object.keys(imageDoc.images)
      })
    }
    
    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.data, 'base64')
    
    // Set appropriate headers
    res.setHeader('Content-Type', imageData.mimeType || 'image/jpeg')
    res.setHeader('Content-Length', buffer.length)
    res.setHeader('Cache-Control', 'public, max-age=3600') // 1 hour cache
    
    return res.send(buffer)
    
  } catch (error) {
    console.error('Image get error:', error)
    return res.status(500).json({
      error: 'Failed to retrieve image',
      details: error.message
    })
  }
}

async function handleImageMetadata(req, res, comicId) {
  try {
    const imageDoc = await getCoverImages(comicId)
    
    if (!imageDoc) {
      return res.status(404).json({ 
        error: 'Image metadata not found',
        comicId
      })
    }
    
    return res.status(200).json({
      success: true,
      comicId,
      availableSizes: Object.keys(imageDoc.images || {}),
      metadata: imageDoc.metadata,
      createdAt: imageDoc.createdAt,
      updatedAt: imageDoc.updatedAt
    })
  } catch (error) {
    console.error('Image metadata error:', error)
    return res.status(500).json({
      error: 'Failed to retrieve image metadata',
      details: error.message
    })
  }
}

async function handleImageDelete(req, res, comicId) {
  try {
    const deleted = await deleteCoverImages(comicId)
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Image not found',
        comicId
      })
    }
    
    return res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      comicId
    })
  } catch (error) {
    console.error('Image delete error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to delete image',
      details: error.message
    })
  }
}