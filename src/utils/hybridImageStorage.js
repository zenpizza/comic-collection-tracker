/**
 * Hybrid Image Storage Service
 * Combines local IndexedDB storage with MongoDB backend storage
 * Implements offline-first approach with background sync
 */

import imageStorage from './imageStorage.js'
import imageCache from './imageCache.js'

class HybridImageStorage {
  constructor() {
    this.syncInProgress = false
    this.syncQueue = []
    this.conflictResolver = null
    this.offlineMode = false
    
    // Check online status
    this.updateOnlineStatus()
    window.addEventListener('online', () => this.updateOnlineStatus())
    window.addEventListener('offline', () => this.updateOnlineStatus())
  }

  /**
   * Update online status and trigger sync if coming back online
   */
  updateOnlineStatus() {
    const wasOffline = this.offlineMode
    this.offlineMode = !navigator.onLine
    
    if (wasOffline && !this.offlineMode) {
      // Just came back online, trigger background sync
      this.backgroundSync()
    }
  }

  /**
   * Store image with hybrid strategy
   */
  async storeImage(comicId, imageData, metadata = {}) {
    try {
      // Always store locally first (offline-first approach)
      const localResult = await imageStorage.storeImage(comicId, imageData, {
        ...metadata,
        localVersion: this.generateVersionHash(imageData),
        lastModified: new Date().toISOString(),
        syncStatus: 'pending'
      })

      // If online, attempt to sync to backend immediately and wait for it
      if (!this.offlineMode) {
        try {
          // Upload directly instead of queuing for background sync
          await this.uploadToRemote(comicId)
          return {
            success: true,
            stored: 'both',
            synced: true,
            localUrl: localResult.url
          }
        } catch (syncError) {
          console.warn('Immediate sync failed, will retry in background:', syncError)
          // Fall back to background sync if immediate upload fails
          this.queueForSync(comicId, 'upload')
          this.backgroundSync()
        }
      }

      return {
        success: true,
        stored: 'local',
        syncing: !this.offlineMode,
        localUrl: localResult.url
      }

    } catch (error) {
      console.error('Hybrid storage error:', error)
      throw error
    }
  }

  /**
   * Get image with hybrid strategy
   */
  async getImage(comicId, size = 'medium') {
    try {
      // Try local storage first
      const localImage = await imageStorage.getImageUrl(comicId, size)
      
      if (localImage) {
        // Check if we need to update from remote
        if (!this.offlineMode) {
          this.checkForRemoteUpdates(comicId)
        }
        return {
          url: localImage,
          source: 'local',
          cached: true
        }
      }

      // If not found locally and online, try to fetch from remote
      if (!this.offlineMode) {
        try {
          const remoteImage = await this.fetchFromRemote(comicId, size)
          if (remoteImage) {
            // Store locally for future use
            await this.storeRemoteImageLocally(comicId, remoteImage)
            return {
              url: remoteImage.url,
              source: 'remote',
              cached: false
            }
          }
        } catch (error) {
          console.warn('Failed to fetch from remote:', error)
        }
      }

      // Not found anywhere
      return null

    } catch (error) {
      console.error('Hybrid get image error:', error)
      throw error
    }
  }

  /**
   * Delete image from both local and remote storage
   */
  async deleteImage(comicId) {
    try {
      const results = {
        local: false,
        remote: false,
        errors: []
      }

      // Delete from local storage
      try {
        await imageStorage.deleteImage(comicId)
        results.local = true
      } catch (error) {
        results.errors.push(`Local deletion failed: ${error.message}`)
      }

      // Delete from remote storage if online
      if (!this.offlineMode) {
        try {
          await this.deleteFromRemote(comicId)
          results.remote = true
        } catch (error) {
          results.errors.push(`Remote deletion failed: ${error.message}`)
        }
      } else {
        // Queue for deletion when back online
        this.queueForSync(comicId, 'delete')
      }

      return results

    } catch (error) {
      console.error('Hybrid delete error:', error)
      throw error
    }
  }

  /**
   * Sync all local images with remote storage
   */
  async syncAll() {
    if (this.syncInProgress || this.offlineMode) {
      return { skipped: true, reason: this.offlineMode ? 'offline' : 'sync_in_progress' }
    }

    this.syncInProgress = true

    try {
      // Get all local images
      const localImages = await imageStorage.getAllImages()
      
      // Get sync status from remote
      const syncResponse = await fetch('/api/images/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localImages: localImages.map(img => ({
            comicId: img.comicId,
            localVersion: img.metadata?.localVersion,
            lastModified: img.metadata?.lastModified
          }))
        })
      })

      if (!syncResponse.ok) {
        throw new Error(`Sync request failed: ${syncResponse.statusText}`)
      }

      const syncData = await syncResponse.json()
      
      const results = {
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: []
      }

      // Upload images that need to go to remote
      for (const comicId of syncData.toUpload) {
        try {
          await this.uploadToRemote(comicId)
          results.uploaded++
        } catch (error) {
          results.errors.push(`Upload failed for ${comicId}: ${error.message}`)
        }
      }

      // Download images that are newer on remote
      for (const item of syncData.toDownload) {
        try {
          await this.downloadFromRemote(item.comicId)
          results.downloaded++
        } catch (error) {
          results.errors.push(`Download failed for ${item.comicId}: ${error.message}`)
        }
      }

      // Handle conflicts
      for (const conflict of syncData.conflicts) {
        try {
          const resolved = await this.resolveConflict(conflict)
          if (resolved) {
            results.conflicts++
          }
        } catch (error) {
          results.errors.push(`Conflict resolution failed for ${conflict.comicId}: ${error.message}`)
        }
      }

      return {
        success: true,
        ...results
      }

    } catch (error) {
      console.error('Sync all error:', error)
      return {
        success: false,
        error: error.message
      }
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Background sync (non-blocking)
   */
  async backgroundSync() {
    if (this.syncInProgress || this.offlineMode) {
      return
    }

    // Process sync queue
    while (this.syncQueue.length > 0) {
      const item = this.syncQueue.shift()
      try {
        if (item.action === 'upload') {
          await this.uploadToRemote(item.comicId)
        } else if (item.action === 'delete') {
          await this.deleteFromRemote(item.comicId)
        }
      } catch (error) {
        console.warn(`Background sync failed for ${item.comicId}:`, error)
        // Re-queue for later retry
        this.queueForSync(item.comicId, item.action)
      }
    }
  }

  /**
   * Queue item for sync
   */
  queueForSync(comicId, action) {
    // Avoid duplicates
    const exists = this.syncQueue.some(item => 
      item.comicId === comicId && item.action === action
    )
    
    if (!exists) {
      this.syncQueue.push({ comicId, action, timestamp: Date.now() })
    }
  }

  /**
   * Upload image to remote storage
   */
  async uploadToRemote(comicId) {
    const localImage = await imageStorage.getImageData(comicId)
    if (!localImage) {
      throw new Error('Local image not found')
    }

    // Extract base64 string from complex data structure
    let base64Data = localImage.data
    if (typeof localImage.data === 'object') {
      // Multi-size format - use full size image
      base64Data = localImage.data.full?.data || localImage.data.medium?.data || localImage.data.thumbnail?.data
    }

    if (!base64Data || typeof base64Data !== 'string') {
      throw new Error('Invalid image data format for upload')
    }

    // Use centralized upload client
    const { default: imageUploadClient } = await import('./imageUploadClient.js')
    
    const result = await imageUploadClient.uploadImage(
      comicId,
      base64Data, // Client will handle base64 to blob conversion
      {
        mimeType: localImage.mimeType || 'image/jpeg',
        ...localImage.metadata
      }
    )

    // Update local metadata to mark as synced
    await imageStorage.updateMetadata(comicId, {
      syncStatus: 'synced',
      lastSyncAt: new Date().toISOString()
    })

    return result
  }

  /**
   * Download image from remote storage
   */
  async downloadFromRemote(comicId) {
    const response = await fetch(`/api/images/${comicId}?metadata=true`)
    if (!response.ok) {
      throw new Error(`Metadata fetch failed: ${response.statusText}`)
    }

    const metadata = await response.json()

    // Download each size
    const sizes = ['thumbnail', 'medium', 'full']
    const imageData = {}

    for (const size of sizes) {
      const imageResponse = await fetch(`/api/images/${comicId}?size=${size}`)
      if (imageResponse.ok) {
        const blob = await imageResponse.blob()
        imageData[size] = {
          data: await this.blobToBase64(blob),
          mimeType: blob.type,
          size: blob.size
        }
      }
    }

    // Store locally
    await imageStorage.storeImage(comicId, imageData, {
      ...metadata,
      syncStatus: 'synced',
      lastSyncAt: new Date().toISOString()
    })

    return imageData
  }

  /**
   * Delete image from remote storage
   */
  async deleteFromRemote(comicId) {
    const response = await fetch(`/api/images/${comicId}`, {
      method: 'DELETE'
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`Remote deletion failed: ${response.statusText}`)
    }

    return response.ok
  }

  /**
   * Fetch image from remote
   * Handles both direct responses and 302 redirects to S3/CloudFront
   */
  async fetchFromRemote(comicId, size) {
    // The API returns 302 redirect to CloudFront for S3 images
    // fetch() automatically follows redirects
    const response = await fetch(`/api/images/${comicId}/${size}`)
    if (!response.ok) {
      return null
    }

    const blob = await response.blob()
    return {
      url: URL.createObjectURL(blob),
      blob,
      mimeType: blob.type,
      size: blob.size
    }
  }

  /**
   * Store remote image locally
   */
  async storeRemoteImageLocally(comicId, remoteImage) {
    const imageData = {
      [remoteImage.size || 'medium']: {
        data: await this.blobToBase64(remoteImage.blob),
        mimeType: remoteImage.mimeType,
        size: remoteImage.size
      }
    }

    await imageStorage.storeImage(comicId, imageData, {
      source: 'remote',
      syncStatus: 'synced',
      lastSyncAt: new Date().toISOString()
    })
  }

  /**
   * Check for remote updates
   */
  async checkForRemoteUpdates(comicId) {
    try {
      const response = await fetch(`/api/images/${comicId}?metadata=true`)
      if (response.ok) {
        const remoteMetadata = await response.json()
        const localMetadata = await imageStorage.getMetadata(comicId)
        
        if (localMetadata && remoteMetadata.updatedAt > localMetadata.lastSyncAt) {
          // Remote is newer, queue for download
          this.queueForSync(comicId, 'download')
        }
      }
    } catch (error) {
      // Ignore errors in background check
      console.debug('Background update check failed:', error)
    }
  }

  /**
   * Resolve sync conflict
   */
  async resolveConflict(conflict) {
    if (this.conflictResolver) {
      return await this.conflictResolver(conflict)
    }

    // Default resolution: use remote version (server wins)
    try {
      await this.downloadFromRemote(conflict.comicId)
      return true
    } catch (error) {
      console.error('Default conflict resolution failed:', error)
      return false
    }
  }

  /**
   * Set custom conflict resolver
   */
  setConflictResolver(resolver) {
    this.conflictResolver = resolver
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    const localStats = await imageStorage.getStorageStats()
    
    let remoteStats = null
    if (!this.offlineMode) {
      try {
        const response = await fetch('/api/images/stats')
        if (response.ok) {
          const data = await response.json()
          remoteStats = data.stats
        }
      } catch (error) {
        console.warn('Failed to get remote stats:', error)
      }
    }

    return {
      local: localStats,
      remote: remoteStats,
      sync: {
        queueLength: this.syncQueue.length,
        inProgress: this.syncInProgress,
        offline: this.offlineMode
      }
    }
  }

  /**
   * Clear local cache
   */
  async clearLocalCache() {
    await imageStorage.clearAll()
    await imageCache.clearCache()
  }

  /**
   * Generate version hash for conflict detection
   */
  generateVersionHash(imageData) {
    const sizes = Object.keys(imageData).sort()
    const sizeString = sizes.map(size => `${size}:${imageData[size].size || 0}`).join('|')
    
    // Use a simple hash instead of btoa to avoid InvalidCharacterError
    let hash = 0
    for (let i = 0; i < sizeString.length; i++) {
      const char = sizeString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 16)
  }

  /**
   * Convert blob to base64
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
}

// Create singleton instance
export const hybridImageStorage = new HybridImageStorage()

// Export class for testing
export { HybridImageStorage }