/**
 * Image Sync API endpoint
 * POST /api/images/sync
 * 
 * Handles image synchronization between local and remote storage
 */

import { getCoverImages } from '../db-image-storage.js'
import { requireAuth } from '../auth.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    })
  }

  try {
    const { localImages } = req.body
    
    if (!Array.isArray(localImages)) {
      return res.status(400).json({
        success: false,
        error: 'localImages must be an array'
      })
    }
    
    const toUpload = []
    const toDownload = []
    const conflicts = []
    
    // Check each local image against remote storage
    for (const localImage of localImages) {
      const { comicId, localVersion, lastModified } = localImage
      
      try {
        const remoteImage = await getCoverImages(comicId)
        
        if (!remoteImage) {
          // Image doesn't exist remotely, needs upload
          toUpload.push(comicId)
        } else {
          const remoteVersion = remoteImage.metadata?.version || remoteImage.updatedAt
          const remoteModified = new Date(remoteImage.updatedAt || remoteImage.createdAt)
          const localModifiedDate = new Date(lastModified)
          
          if (localVersion !== remoteVersion) {
            if (localModifiedDate > remoteModified) {
              // Local is newer, upload
              toUpload.push(comicId)
            } else if (remoteModified > localModifiedDate) {
              // Remote is newer, download
              toDownload.push({
                comicId,
                imageId: remoteImage._id,
                remoteVersion
              })
            } else {
              // Same timestamp but different versions - conflict
              conflicts.push({
                comicId,
                localVersion,
                remoteVersion
              })
            }
          }
          // If versions match, no action needed
        }
      } catch (error) {
        console.error(`Sync check failed for ${comicId}:`, error)
        // Skip this image and continue
      }
    }
    
    return res.status(200).json({
      success: true,
      toUpload,
      toDownload,
      conflicts
    })
  } catch (error) {
    console.error('Image sync error:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to sync images',
      details: error.message
    })
  }
}