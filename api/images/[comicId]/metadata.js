/**
 * Image Metadata API endpoint
 * GET /api/images/[comicId]/metadata
 * 
 * Retrieves image metadata from MongoDB storage
 */

import { getCoverImages } from '../../db-image-storage.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

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
    
    console.log(`[Dynamic Route] Retrieving metadata for comic: ${comicId}`)
    
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
    if (imageData.images) {
      // Multi-size format
      metadata.images = {}
      for (const [size, sizeData] of Object.entries(imageData.images)) {
        metadata.images[size] = {
          size: sizeData.size || 0,
          mimeType: sizeData.mimeType,
          dimensions: sizeData.dimensions || { width: 0, height: 0 }
        }
      }
    } else if (imageData.imageData) {
      // Legacy single-size format
      metadata.images = {
        medium: {
          size: imageData.size || 0,
          mimeType: imageData.mimeType || 'image/jpeg',
          dimensions: imageData.dimensions || { width: 0, height: 0 }
        }
      }
    }
    
    console.log(`[Dynamic Route] Successfully retrieved metadata for comic: ${comicId}`)
    
    return res.status(200).json({
      success: true,
      metadata
    })
    
  } catch (error) {
    console.error('[Dynamic Route] Metadata retrieval error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve metadata',
      details: error.message
    })
  }
}